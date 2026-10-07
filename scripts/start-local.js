process.env.NODE_ENV = process.env.NODE_ENV || "development";
process.env.AUTH_MODE = process.env.AUTH_MODE || "DEVELOPMENT_MOCK";
process.env.HIPASS_STORE = process.env.HIPASS_STORE || "json";
process.env.DICOM_TOKEN_SECRET = process.env.DICOM_TOKEN_SECRET || "replace-with-local-32-byte-minimum-secret";
process.env.PORT = process.env.PORT || "3000";

await import("../src/server.js");
