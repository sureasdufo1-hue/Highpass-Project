window.config = {
  routerBasename: "/",
  showStudyList: true,
  maxNumberOfWebWorkers: 3,
  showWarningMessageForCrossOrigin: false,
  showCPUFallbackMessage: false,
  strictZSpacingForVolumeViewport: true,
  dataSources: [
    {
      namespace: "@ohif/extension-default.dataSourcesModule.dicomweb",
      sourceName: "hospitalAOrthanc",
      configuration: {
        friendlyName: "Hospital A Orthanc",
        name: "hospitalAOrthanc",
        qidoRoot: "http://localhost:8042/dicom-web",
        wadoRoot: "http://localhost:8042/dicom-web",
        wadoUriRoot: "http://localhost:8042/wado",
        qidoSupportsIncludeField: false,
        supportsReject: false,
        imageRendering: "wadors",
        thumbnailRendering: "wadors",
        enableStudyLazyLoad: true,
        supportsFuzzyMatching: false,
        supportsWildcard: false,
        staticWado: false,
        singlepart: "bulkdata,video,pdf",
        omitQuotationForMultipartRequest: true
      }
    }
  ],
  defaultDataSourceName: "hospitalAOrthanc",
  whiteLabeling: {
    createLogoComponentFn: function () {
      return null;
    }
  },
  hotkeys: []
};
