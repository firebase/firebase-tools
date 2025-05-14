export interface FirebaseFilterInterval {
  /**
   * Time filter showing the start time after which the issues are listed.
   */
  startTime: string;
  /**
   * Time filted until which the issues needs to be listed.
   */
  endTime: string;
}

export interface PageDetails {
  /**
   * Number of issues to fetch in a request.
   */
  pageSize: number;
  /**
   * Parameter used when fetching multiple pages. A reference to know the number of issues fetched so for.
   */
  pageToken: string;
}

/**
 * Interface for different filters for fetching.
 */
export interface FirebaseFilters {
  /**
   * Different category of devices. Eg: Phone, Tablet.
   */
  categories: string[];
  /**
   * Custom keys as defined on the Crashlytics SDK when capturing crashes.
   */
  customKeys: string[];
  /**
   * Type of different crash events. Eg: Fatal, ANR.
   */
  eventType: string[];
  /**
   * Boolean indicating if an issue has crash insights.
   */
  hasCrashlyticsInsights: Boolean;
  /**
   * Device manufacturers.
   */
  manufacturerModels: string[];
  /**
   * OS Version of the mobile device.
   */
  osVersions: string[];
  /**
   * Rollout related filter.
   */
  rollouts: string[];
}

export interface listTopIssuesParams {
  /**
   * Different set of filters used for fetching issues.
   */
  filters: FirebaseFilters;
  /**
   * Time interval used for fetching issues.
   */
  interval: FirebaseFilterInterval;
  /**
   * The field that needs to be used for sorting issues. Eg: Event count
   */
  orderBy: string;
  /**
   * Paging related parameters.
   */
  pageDetails: PageDetails;
}
