const childProcess = require('child_process')
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const https = require('https')
const packageJson = require('./package.json')

// Lookup table for all platforms and binary distribution packages
const BINARY_DISTRIBUTION_PACKAGES = {
  'darwin-x64': 'warpdive-darwin-amd64',
  'darwin-arm64': 'warpdive-darwin-arm64',
  'linux-x64': 'warpdive-linux-amd64',
  'linux-arm64': 'warpdive-linux-arm64',
  'win32-x64': 'warpdive-windows-amd64',
  'win32-arm64': 'warpdive-windows-arm64'
}

// Windows binaries end with .exe so we need to special case them.
const binaryName = process.platform === 'win32' ? 'warpdive.exe' : 'warpdive'

// Compute the path we want to emit the fallback binary to
const fallbackBinaryPath = path.join(__dirname, binaryName)

// Determine package name for this platform
const platformSpecificPackageName = BINARY_DISTRIBUTION_PACKAGES[`${process.platform}-${process.arch}`]

// Adjust the version you want to install. You can also make this dynamic.
const BINARY_DISTRIBUTION_VERSION = packageJson.version

function isPlatformSpecificPackageInstalled() {
  try {
    // Resolving will fail if the optionalDependency was not installed
    require.resolve(`${platformSpecificPackageName}/bin/${binaryName}`)
    return true
  } catch (e) {
    return false
  }
}

function isFallbackBinaryInstalled() {
  return fs.existsSync(fallbackBinaryPath)
}

function getBinaryPath() {
  try {
    // Resolving will fail if the optionalDependency was not installed
    return require.resolve(`${platformSpecificPackageName}/bin/${binaryName}`)
  } catch (e) {
    return fallbackBinaryPath
    // return require('path').join(__dirname, '..', binaryName)
  }
}

function runBinary(args) {
  // Skip downloading the binary if it was already installed via optionalDependencies
  if (!isPlatformSpecificPackageInstalled()) {
    if (isFallbackBinaryInstalled()) {
      childProcess.execFileSync(getBinaryPath(), args, {
        stdio: 'inherit'
      })
    } else {
      downloadBinaryFromNpm()
        .then(() => {
          childProcess.execFileSync(getBinaryPath(), args, {
            stdio: 'inherit'
          })
        })
        .catch((error) => {
          console.log('Failed to download and execute the binary:', error)
        })
    }
  } else {
    childProcess.execFileSync(getBinaryPath(), args, {
      stdio: 'inherit'
    })
  }
}

function makeRequest(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          const chunks = []
          response.on('data', (chunk) => chunks.push(chunk))
          response.on('end', () => {
            resolve(Buffer.concat(chunks))
          })
        } else if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          // Follow redirects
          makeRequest(response.headers.location).then(resolve, reject)
        } else {
          reject(new Error(`npm responded with status code ${response.statusCode} when downloading the package!`))
        }
      })
      .on('error', (error) => {
        reject(error)
      })
  })
}

function extractFileFromTarball(tarballBuffer, filepath) {
  // Tar archives are organized in 512 byte blocks.
  // Blocks can either be header blocks or data blocks.
  // Header blocks contain file names of the archive in the first 100 bytes, terminated by a null byte.
  // The size of a file is contained in bytes 124-135 of a header block and in octal format.
  // The following blocks will be data blocks containing the file.
  let offset = 0
  while (offset < tarballBuffer.length) {
    const header = tarballBuffer.subarray(offset, offset + 512)
    offset += 512

    const fileName = header.toString('utf-8', 0, 100).replace(/\0.*/g, '')
    const fileSize = parseInt(header.toString('utf-8', 124, 136).replace(/\0.*/g, ''), 8)

    if (fileName === filepath) {
      return tarballBuffer.subarray(offset, offset + fileSize)
    }

    // Clamp offset to the uppoer multiple of 512
    offset = (offset + fileSize + 511) & ~511
  }
}

async function downloadBinaryFromNpm() {
  // Download the tarball of the right binary distribution package
  const tarballDownloadBuffer = await makeRequest(
    `https://registry.npmjs.org/${platformSpecificPackageName}/-/${platformSpecificPackageName}-${BINARY_DISTRIBUTION_VERSION}.tgz`
  )

  const tarballBuffer = zlib.unzipSync(tarballDownloadBuffer)

  // Extract binary from package and write to disk
  fs.writeFileSync(
    fallbackBinaryPath,
    extractFileFromTarball(tarballBuffer, `package/bin/${binaryName}`),
    {mode: 0o755} // Make binary file executable
  )
}

module.exports = {
  downloadBinaryFromNpm,
  isPlatformSpecificPackageInstalled,
  platformSpecificPackageName,
  runBinary
}
