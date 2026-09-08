window.config = {
  routerBasename: "/",
  extensions: [],
  modes: [],
  customizationService: {},
  showStudyList: true,
  maxNumberOfWebWorkers: 3,
  showWarningMessageForCrossOrigin: false,
  showCPUFallbackMessage: false,
  showLoadingIndicator: true,
  strictZSpacingForVolumeViewport: true,
  dataSources: [
    {
      namespace: "@ohif/extension-default.dataSourcesModule.dicomweb",
      sourceName: "hospitalAOrthanc",
      configuration: {
        friendlyName: "Hospital A Orthanc",
        name: "hospitalAOrthanc",
        qidoRoot: "https://localhost:3443/dicomweb",
        wadoRoot: "https://localhost:3443/dicomweb",
        wadoUriRoot: "https://localhost:3443/dicomweb",
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
