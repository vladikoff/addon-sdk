const { Ci, Cc } = require("chrome");

const PR_RDONLY      = 0x01;
const PR_WRONLY      = 0x02;
const PR_RDWR        = 0x04;
const PR_CREATE_FILE = 0x08;
const PR_APPEND      = 0x10;
const PR_TRUNCATE    = 0x20;
const PR_SYNC        = 0x40;
const PR_EXCL        = 0x80;

// Default compression level:
const { COMPRESSION_DEFAULT } = Ci.nsIZipWriter;

function createNsFile(path) {
  let file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
  try {
    file.initWithPath(path);
  } catch(e) {
    throw new Error("This zip file path is not valid : " + path + "\n" + e);
  }
  return file;
}

const converter = Cc["@mozilla.org/intl/scriptableunicodeconverter"].
                  createInstance(Ci.nsIScriptableUnicodeConverter);
converter.charset = "UTF-8";
function streamForData(data) {
  return converter.convertToInputStream(data);
}

exports.ZipWriter = function (zipPath, mode) {
  mode = mode ? mode : PR_RDWR | PR_CREATE_FILE | PR_TRUNCATE;

  let zw = Cc["@mozilla.org/zipwriter;1"].createInstance(Ci.nsIZipWriter);
  zw.open(createNsFile(zipPath), mode);

  // Create a directory entry.
  // Returns true if the entry was created, or false if the entry already exists
  this.mkdir = function mkdir(pathInZip) {
    try {
      zw.addEntryDirectory(pathInZip, 0, false);
    }
    catch(e) {
      if (e.name === "NS_ERROR_FILE_ALREADY_EXISTS")
        return false;
      throw e
    }
    return true;
  }

  this.addFile = function addFile(pathInZip, filePath) {
    let nsfile = createNsFile(filePath);
    if (!nsfile.exists())
      throw new Error("This file doesn't exists : " + nsfile.path);

    // Case 1/ Regular file
    if (!nsfile.isDirectory()) {
      try {
        zw.addEntryFile(pathInZip, COMPRESSION_DEFAULT, nsfile, false);
      } catch(e) {
        throw new Error("Unable to add following file in zip: " + nsfile.path +
                        "\n" + e);
      }
      return;
    }

    // Case 2/ Directory
    if (pathInZip.substr(-1) !== '/')
      pathInZip += "/";
    let entries = nsfile.directoryEntries;
    let array = [];

    zw.addEntryDirectory(pathInZip, nsfile.lastModifiedTime, false);

    while(entries.hasMoreElements()) {
      let file = entries.getNext().QueryInterface(Ci.nsIFile);
      if (file.leafName === "." || file.leafName === "..")
        continue;
      let path = pathInZip + file.leafName;
      this.add(path, file);
    }
  }

  this.addData = function (pathInZip, data) {
    try {
      let stream = streamForData(data);
      zw.addEntryStream(pathInZip, 0, COMPRESSION_DEFAULT, stream, false);
    } catch(e) {
      throw new Error("Unable to add following data in zip: " +
                      data.substr(0, 20) + "\n" + e);
    }
  }

  this.close = function close() {
    zw.close();
  }
}