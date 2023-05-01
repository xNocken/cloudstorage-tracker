export interface CloudstorageResponse {
  uniqueFilename: string;
  filename: string;
  hash: string;
  hash256: string;
  length: number;
  contentType: string;
  uploaded: string;
  storageType: string;
  storageIds: {
    DSS: string;
  };
  doNotCache: false;
}
