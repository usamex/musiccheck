// Node stand-in for expo-file-system, used only by scripts/contract-check.cjs.
class File {
  constructor() {
    throw new Error('expo-file-system is not available in Node; pass createFilePart');
  }
}
module.exports = { File };
