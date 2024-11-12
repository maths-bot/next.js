import { InvariantError } from '../../shared/lib/invariant-error'
import {
  postponeWithTracking,
  throwToInterruptStaticGeneration,
  trackDynamicDataInDynamicRender,
} from '../app-render/dynamic-rendering'
import {
  workAsyncStorage,
  type WorkStore,
} from '../app-render/work-async-storage.external'
import {
  workUnitAsyncStorage,
  type PrerenderStore,
  type PrerenderStoreLegacy,
  type PrerenderStorePPR,
} from '../app-render/work-unit-async-storage.external'
import { makeHangingPromise } from '../dynamic-rendering-utils'
import type { FallbackRouteParams } from './fallback-params'
import type { Params } from './params'
import { describeStringPropertyAccess, wellKnownProperties } from './utils'

interface CacheLifetime {}
const CachedParams = new WeakMap<CacheLifetime, Promise<Params>>()

export async function unstable_rootParams(): Promise<Params> {
  const workStore = workAsyncStorage.getStore()
  const workUnitStore = workUnitAsyncStorage.getStore()

  if (!workStore) {
    throw new InvariantError('Missing workStore in unstable_rootParams')
  }

  if (workUnitStore) {
    if (workUnitStore.type === 'prerender') {
      // dynamicIO Prerender
      // We don't track dynamic access here because access will be tracked when you access
      // one of the properties of the params object.
      createPrerenderParams(workStore.rootParams, workStore, workUnitStore)
    } else if (workUnitStore.type === 'prerender-ppr') {
      // PPR Prerender (no dynamicIO)
      // We are prerendering with PPR. We need track dynamic access here eagerly
      // to keep continuity with how headers has worked in PPR without dynamicIO.
      // TODO consider switching the semantic to throw on property access instead
      postponeWithTracking(
        workStore.route,
        'rootParams',
        workUnitStore.dynamicTracking
      )
    } else if (workUnitStore.type === 'prerender-legacy') {
      // Legacy Prerender
      // We are in a legacy static generation mode while prerendering
      // We track dynamic access here so we don't need to wrap the headers in
      // individual property access tracking.
      throwToInterruptStaticGeneration('rootParams', workStore, workUnitStore)
    }
  }

  // We fall through to the dynamic context below but we still track dynamic access
  // because in dev we can still error for things like using headers inside a cache context
  trackDynamicDataInDynamicRender(workStore, workUnitStore)

  return workStore.rootParams
}

function createPrerenderParams(
  underlyingParams: Params,
  workStore: WorkStore,
  prerenderStore: PrerenderStore
): Promise<Params> {
  const fallbackParams = workStore.fallbackRouteParams
  if (fallbackParams) {
    let hasSomeFallbackParams = false
    for (const key in underlyingParams) {
      if (fallbackParams.has(key)) {
        hasSomeFallbackParams = true
        break
      }
    }

    if (hasSomeFallbackParams) {
      // params need to be treated as dynamic because we have at least one fallback param
      if (prerenderStore.type === 'prerender') {
        // We are in a dynamicIO (PPR or otherwise) prerender
        const cachedParams = CachedParams.get(underlyingParams)
        if (cachedParams) {
          return cachedParams
        }

        const promise = makeHangingPromise<Params>(
          prerenderStore.renderSignal,
          '`params`'
        )
        CachedParams.set(underlyingParams, promise)

        return promise
      }
      // remaining cases are prender-ppr and prerender-legacy
      // We aren't in a dynamicIO prerender but we do have fallback params at this
      // level so we need to make an erroring exotic params object which will postpone
      // if you access the fallback params
      return makeErroringRootParams(
        underlyingParams,
        fallbackParams,
        workStore,
        prerenderStore
      )
    }
  }

  // We don't have any fallback params so we have an entirely static safe params object
  return makeUntrackedRootParams(underlyingParams)
}

function makeErroringRootParams(
  underlyingParams: Params,
  fallbackParams: FallbackRouteParams,
  workStore: WorkStore,
  prerenderStore: PrerenderStorePPR | PrerenderStoreLegacy
): Promise<Params> {
  const cachedParams = CachedParams.get(underlyingParams)
  if (cachedParams) {
    return cachedParams
  }

  // We don't use makeResolvedReactPromise here because params
  // supports copying with spread and we don't want to unnecessarily
  // instrument the promise with spreadable properties of ReactPromise.
  const promise = Promise.resolve(underlyingParams)
  CachedParams.set(underlyingParams, promise)

  Object.keys(underlyingParams).forEach((prop) => {
    if (wellKnownProperties.has(prop)) {
      // These properties cannot be shadowed because they need to be the
      // true underlying value for Promises to work correctly at runtime
    } else {
      if (fallbackParams.has(prop)) {
        Object.defineProperty(promise, prop, {
          get() {
            const expression = describeStringPropertyAccess('rootParams', prop)
            // In most dynamic APIs we also throw if `dynamic = "error"` however
            // for params is only dynamic when we're generating a fallback shell
            // and even when `dynamic = "error"` we still support generating dynamic
            // fallback shells
            // TODO remove this comment when dynamicIO is the default since there
            // will be no `dynamic = "error"`
            if (prerenderStore.type === 'prerender-ppr') {
              // PPR Prerender (no dynamicIO)
              postponeWithTracking(
                workStore.route,
                expression,
                prerenderStore.dynamicTracking
              )
            } else {
              // Legacy Prerender
              throwToInterruptStaticGeneration(
                expression,
                workStore,
                prerenderStore
              )
            }
          },
          set(newValue) {
            Object.defineProperty(promise, prop, {
              value: newValue,
              writable: true,
              enumerable: true,
            })
          },
          enumerable: true,
          configurable: true,
        })
      } else {
        ;(promise as any)[prop] = underlyingParams[prop]
      }
    }
  })

  return promise
}

function makeUntrackedRootParams(underlyingParams: Params): Promise<Params> {
  const cachedParams = CachedParams.get(underlyingParams)
  if (cachedParams) {
    return cachedParams
  }

  // We don't use makeResolvedReactPromise here because params
  // supports copying with spread and we don't want to unnecessarily
  // instrument the promise with spreadable properties of ReactPromise.
  const promise = Promise.resolve(underlyingParams)
  CachedParams.set(underlyingParams, promise)

  Object.keys(underlyingParams).forEach((prop) => {
    if (wellKnownProperties.has(prop)) {
      // These properties cannot be shadowed because they need to be the
      // true underlying value for Promises to work correctly at runtime
    } else {
      ;(promise as any)[prop] = underlyingParams[prop]
    }
  })

  return promise
}
