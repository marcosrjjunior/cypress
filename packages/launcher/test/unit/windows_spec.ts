import _ from 'lodash'
import { expect } from 'chai'
import * as windowsHelper from '../../lib/windows'
import { normalize } from 'path'
import { utils } from '../../lib/utils'
import sinon, { SinonStub } from 'sinon'
import { browsers } from '../../lib/browsers'
import Bluebird from 'bluebird'
import fse from 'fs-extra'
import os from 'os'
import snapshot from 'snap-shot-it'
import { Browser } from '../../lib/types'

function stubBrowser (path: string, version: string) {
  path = normalize(path.replace(/\\/g, '\\\\'))

  ;(utils.execa as unknown as SinonStub)
  .withArgs('wmic', ['datafile', 'where', `name="${path}"`, 'get', 'Version', '/value'])
  .resolves({ stdout: `Version=${version}` })

  ;(fse.pathExists as SinonStub)
  .withArgs(path)
  .resolves(true)
}

function detect (goalBrowsers: Browser[]) {
  return Bluebird.mapSeries(goalBrowsers, (browser) => {
    return windowsHelper.detect(browser)
    .then((foundBrowser) => {
      return _.merge(browser, foundBrowser)
    })
  })
}

const HOMEDIR = 'C:/Users/flotwig'

describe('windows browser detection', () => {
  beforeEach(() => {
    sinon.stub(fse, 'pathExists').resolves(false)
    sinon.stub(os, 'homedir').returns(HOMEDIR)
    sinon.stub(utils, 'execa').rejects()
  })

  it('detects browsers as expected', async () => {
    stubBrowser('C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '1.2.3')
    stubBrowser('C:/Program Files (x86)/Google/chrome-win32/chrome.exe', '2.3.4')

    // canary is installed in homedir
    stubBrowser(`${HOMEDIR}/AppData/Local/Google/Chrome SxS/Application/chrome.exe`, '3.4.5')

    // have 32-bit and 64-bit ff - 64-bit will be preferred
    stubBrowser('C:/Program Files (x86)/Mozilla Firefox/firefox.exe', '72')
    stubBrowser('C:/Program Files/Mozilla Firefox/firefox.exe', '72')

    // 32-bit dev edition
    stubBrowser('C:/Program Files (x86)/Firefox Developer Edition/firefox.exe', '73')

    // 64-bit nightly edition
    stubBrowser('C:/Program Files/Firefox Nightly/firefox.exe', '74')

    stubBrowser('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '11')
    stubBrowser('C:/Program Files (x86)/Microsoft/Edge Beta/Application/msedge.exe', '12')
    stubBrowser('C:/Program Files (x86)/Microsoft/Edge Dev/Application/msedge.exe', '13')

    // edge canary is installed in homedir
    stubBrowser(`${HOMEDIR}/AppData/Local/Microsoft/Edge SxS/Application/msedge.exe`, '14')

    snapshot(await detect(browsers))
  })

  // @see https://github.com/cypress-io/cypress/issues/8425
  it('detects new Chrome 64-bit app path', async () => {
    stubBrowser('C:/Program Files/Google/Chrome/Application/chrome.exe', '4.4.4')
    const chrome = _.find(browsers, { name: 'chrome', channel: 'stable' })

    snapshot(await windowsHelper.detect(chrome))
  })

  // @see https://github.com/cypress-io/cypress/issues/8432
  it('detects local Firefox installs', async () => {
    stubBrowser(`${HOMEDIR}/AppData/Local/Mozilla Firefox/firefox.exe`, '100')
    stubBrowser(`${HOMEDIR}/AppData/Local/Firefox Nightly/firefox.exe`, '200')
    stubBrowser(`${HOMEDIR}/AppData/Local/Firefox Developer Edition/firefox.exe`, '300')

    const firefoxes = _.filter(browsers, { family: 'firefox' })

    snapshot(await detect(firefoxes))
  })

  context('#getVersionString', () => {
    it('runs wmic and returns output', async () => {
      stubBrowser('foo', 'bar')

      expect(await windowsHelper.getVersionString('foo')).to.eq('Version=bar')
    })

    it('rejects with errors', async () => {
      const err = new Error()

      ;(utils.execa as unknown as SinonStub)
      .withArgs('wmic', ['datafile', 'where', 'name="foo"', 'get', 'Version', '/value'])
      .rejects(err)

      await expect(windowsHelper.getVersionString('foo')).to.be.rejectedWith(err)
    })
  })
})
