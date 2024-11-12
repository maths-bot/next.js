import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'

describe('app-root-params - multiple roots', () => {
  const { next, isNextDeploy } = nextTestSetup({
    files: join(__dirname, 'fixtures', 'multiple-roots'),
  })

  it('should have root params on dashboard pages', async () => {
    const $ = await next.render$('/1/data')
    expect($('body').text()).toContain('Dashboard Root')
    expect($('p').text()).toBe('hello world {"id":"1"}')
  })

  it('should not have root params on marketing pages', async () => {
    const $ = await next.render$('/landing')
    expect($('body').text()).toContain('Marketing Root')
    expect($('p').text()).toBe('hello world {}')
  })

  if (!isNextDeploy) {
    it('should correctly generate types', async () => {
      expect(await next.hasFile('.next/types/server.d.ts')).toBe(true)
      const fileContents = await next.readFile('.next/types/server.d.ts')
      expect(fileContents).toContain(
        `export function unstable_rootParams(): Promise<{ id?: string }>`
      )
    })
  }
})
