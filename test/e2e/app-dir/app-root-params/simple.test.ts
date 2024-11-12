import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'

describe('app-root-params - simple', () => {
  const { next, isNextDeploy } = nextTestSetup({
    files: join(__dirname, 'fixtures', 'simple'),
  })

  it('should return rootParams', async () => {
    const $ = await next.render$('/en/us')
    expect($('p').text()).toBe('hello world {"lang":"en","locale":"us"}')
  })

  it('should only return rootParams and not other params', async () => {
    const $ = await next.render$('/en/us/other/1')
    expect($('#dynamic-params').text()).toBe('1')
    expect($('#root-params').text()).toBe('{"lang":"en","locale":"us"}')
  })

  if (!isNextDeploy) {
    it('should correctly generate types', async () => {
      expect(await next.hasFile('.next/types/server.d.ts')).toBe(true)
      const fileContents = await next.readFile('.next/types/server.d.ts')
      expect(fileContents).toContain(
        `export function unstable_rootParams(): Promise<{ lang: string, locale: string }>`
      )
    })
  }
})
