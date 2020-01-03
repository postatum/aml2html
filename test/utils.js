/* global describe, it, beforeEach, afterEach */

const expect = require('chai').expect
const tmp = require('tmp')
const utils = require('../src/utils')

describe('utils.collectOpt', function () {
  it('should concat options strings', function () {
    expect(utils.collectOpt('b', '')).to.deep.equal('b')
    expect(utils.collectOpt('b', 'a')).to.deep.equal('ab')
    expect(utils.collectOpt('bc', 'a')).to.deep.equal('abc')
  })
})

describe('utils.walkSync', function () {
  let tmpDir1, tmpDir2, tmpFile1, tmpFile2, tmpFile3
  beforeEach(function () {
    tmpDir1 = tmp.dirSync()
    tmpDir2 = tmp.dirSync({ dir: tmpDir1.name })
    tmpFile1 = tmp.fileSync({ dir: tmpDir2.name, postfix: '.xml' })
    tmpFile2 = tmp.fileSync({ dir: tmpDir2.name, postfix: '.yaml' })
    tmpFile3 = tmp.fileSync({ dir: tmpDir1.name, postfix: '.yaml' })
  })
  afterEach(function () {
    tmp.setGracefulCleanup()
    tmpFile1.removeCallback()
    tmpFile2.removeCallback()
    tmpDir2.removeCallback()
    tmpFile3.removeCallback()
    tmpDir1.removeCallback()
  })
  it('should list yaml files in nested directories', function () {
    const data = utils.walkSync(tmpDir1.name)
    expect(data).to.be.lengthOf(2)
    expect(data).to.be.contain(tmpFile2.name)
    expect(data).to.be.contain(tmpFile3.name)
  })
  it('should append found files names to passed list', function () {
    const data = utils.walkSync(tmpDir1.name, ['foo'])
    expect(data).to.be.lengthOf(3)
    expect(data).to.be.contain('foo')
    expect(data).to.be.contain(tmpFile2.name)
    expect(data).to.be.contain(tmpFile3.name)
  })
})
