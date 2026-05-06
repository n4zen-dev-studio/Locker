module.exports = {
  dependency: {
    platforms: {
      android: {
        sourceDir: "./android",
        packageImportPath: "import com.n4zen.calculator.locker.LockerKeystorePackage;",
        packageInstance: "new LockerKeystorePackage()",
      },
      ios: null,
    },
  },
}
