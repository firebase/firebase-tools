export interface FirebaseFilterInterval {
    startTime: string;
    endTime: string;
}

export interface PageDetails {
    pageSize: string
    pageToken: string
}

export interface FirebaseFilters {
    categories: Array<string>;
    customKeys: Array<string>;
    eventType: Array<string>;
    hasCrashlyticsInsights: Boolean;
    manufacturerModels: Array<string>;
    osVersions: Array<string>;
    rollouts: Array<string>;
}

export interface listTopIssuesParams {
    filters: FirebaseFilters;
    interval: FirebaseFilterInterval;
    orderBy: string;
    pageDetails: PageDetails;
}