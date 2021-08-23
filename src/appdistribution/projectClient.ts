import * as api from '../api';
import * as _ from 'lodash';

export class AppDistributionClient {
  static DEFAULT_POLLING_TIMEOUTL_MS = 5 * 60 * 1000;
  static DEFAULT_POLLING_BACKOFF_MS = 1000;

  private readonly projectNumber: string;

  constructor(projectNum: string) {
    this.projectNumber = `${projectNum}`;
  }




}