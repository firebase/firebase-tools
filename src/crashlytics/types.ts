/** A group of results in an EventReport, similar to a SQL "GROUP BY" result. */
export interface ReportGroup {
  /** Scalar metrics will contain a single object covering the entire interval, while time-dimensioned graphs will contain one per time grain. */
  metrics: IntervalMetrics[];
  /** Additional nested groupings when relevant, eg by operating system and operating system version */
  subgroups: ReportGroup[];
  /** The entity by which the computed metrics is grouped. */
  issue?: Issue;
  variant?: IssueVariant;
  version?: Version;
  device?: Device;
  operatingSystem?: OperatingSystem;
}

/** A set of computed metric values for a time interval */
export interface IntervalMetrics {
  /** The start of the interval covered by the computation. */
  startTime: string;
  /** The end of the interval covered by the computation. */
  endTime: string;
  /** The total count of events in the interval. */
  eventsCount: number;
  /** The cardinality of distinct users in the set of events. */
  impactedUsersCount: number;
}

/** Application software version. */
export interface Version {
  /** Human-readable version string, eg "1.2.3" */
  displayVersion?: string;
  /** One display_version can have many build_version. */
  buildVersion?: string;
  /** Compound human-readable string containing both display and build versions. */
  displayName?: string;
  /** Indicates releases which have artifacts that are currently available in the Play Store to the target audience of the track. */
  tracks?: PlayTrack[];
}

/** Describes a release track in the Play Developer Console. */
export interface PlayTrack {
  /** User-generated or auto-generated name of this track. */
  title?: string;
  /** The type of track (prod, internal, etc.). */
  type?: TrackType;
}

/** An issue describes a set of similar events that have been analyzed by Crashlytics and grouped together. */
export interface Issue {
  /** Unique identifier for the issue. */
  id?: string;
  /** Caption title. This is usually a source file or method name. */
  title?: string;
  /** Caption subtitle. This is usually a symbol or an exception message. */
  subtitle?: string;
  /** Indicates whether this issue is a crash, non-fatal exception, or ANR. */
  errorType?: ErrorType;
  /** The resource name for a sample event in this issue. */
  sampleEvent?: string;
  /** Provides a link to the Issue on the Firebase console. */
  uri?: string;
  /** The first app display_version in which this issue was seen. */
  firstSeenVersion?: string;
  /** The most recent app display_version in which this issue was seen. */
  lastSeenVersion?: string;
  /** Distinctive characteristics assigned by the Crashlytics analyzer. */
  signals?: IssueSignals[];
  /** Indicates whether this issue is open, closed or muted. */
  state?: State;
  /** The number of notes attached to an issue. */
  notesCount?: number;
  /** The name of the issue resource. */
  name?: string;
  /** The top 12 variants (subgroups) within the issue. */
  variants?: IssueVariant[];
}

/** A variant is a subgroup of an issue where all events have very similar stack traces. */
export interface IssueVariant {
  /** Distinct identifier for the variant. */
  id?: string;
  /** The resource name for a sample event in this variant. */
  sampleEvent?: string;
  /** Provides a link to the Variant on the Firebase console. */
  uri?: string;
}

/** Distinctive characteristics assigned by the Crashlytics analyzer. */
export interface IssueSignals {
  /** The signal name. */
  signal: Signal;
  /** Supporting detail information. */
  description: string;
}

/** The message describing a single Crashlytics event. */
export interface Event {
  /** The name of the event resource. */
  name?: string;
  /** Mobile platform (Android or iOS). */
  platform?: string;
  /** The bundle name for iOS apps or the package name of Android apps. */
  bundleOrPackage?: string;
  /** The unique event identifier is assigned during processing. */
  eventId?: string;
  /** Device timestamp at which the event was recorded. */
  eventTime?: string;
  /** Server timestamp at which the event was received by Crashlytics. */
  receivedTime?: string;
  /** Details for the Issue assigned to this Event. */
  issue?: Issue;
  /** Details for the IssueVariant assigned to this Event. */
  issueVariant?: IssueVariant;
  /** Mobile device metadata. */
  device?: Device;
  /** Mobile device memory usage. */
  memory?: Memory;
  /** Mobile device disk/flash usage. */
  storage?: Storage;
  /** Operating system and version. */
  operatingSystem?: OperatingSystem;
  /** Mobile application version. */
  version?: Version;
  /** End user identifiers for the device owner. */
  user?: User;
  /** Custom keys set by the developer during the session. */
  customKeys?: { [key: string]: string };
  /** Unique identifier for the device-app installation. */
  installationUuid?: string;
  /** Crashlytics SDK version. */
  crashlyticsSdkVersion?: string;
  /** App orientation at the time of the crash (portrait or landscape). */
  appOrientation?: string;
  /** Device orientation at the time of the crash (portrait or landscape). */
  deviceOrientation?: string;
  /** Log messages recorded by the developer during the session. */
  logs?: Log[];
  /** Analytics events recorded by the analytics SDK during the session. */
  breadcrumbs?: Breadcrumb[];
  /** The stack trace frame blamed by Crashlytics processing. */
  blameFrame?: Frame;
  /** Android only: Exceptions that occurred during this event. */
  exceptions?: Exception[];
  /** Apple only: A non-fatal error captured by the iOS SDK and its stacktrace. */
  errors?: Error[];
  /** Application threads present at the time the event was recorded. */
  threads?: Thread[];
  /** The state of the app process at the time of the event. */
  processState?: string;
  /** The title of the issue in which the event was grouped. */
  issueTitle?: string;
  /** The subtitle of the issue in which the event was grouped. */
  issueSubtitle?: string;
  /** Metadata provided by the app's build system, including version control repository info. */
  buildStamp?: string;
}

/** Mobile device metadata. */
export interface Device {
  /** Device brand name which is consistent with android.os.Build.BRAND */
  manufacturer?: string;
  /** The model name which is consistent with android.os.Build.MODEL */
  model?: string;
  /** Device processor architecture. */
  architecture?: string;
  /** Full device name, suitable for passing to DeviceFilter. */
  displayName?: string;
  /** An invariant name of the manufacturer that submitted this product in its most recognizable human-readable form. */
  companyName?: string;
  /** Marketing name, most recognizable human-readable form. */
  marketingName?: string;
  /** See FormFactor message */
  formFactor?: FormFactor;
}

/** Mobile device memory usage. */
export interface Memory {
  /** Bytes in use. */
  used?: number;
  /** Bytes free. */
  free?: number;
}

/** Mobile device disk/flash usage. */
export interface Storage {
  /** Bytes used. */
  used?: number;
  /** Bytes free. */
  free?: number;
}

/** Mobile device operating system metadata. */
export interface OperatingSystem {
  /** Operating system display version number. */
  displayVersion?: string;
  /** Operating system name. */
  os?: string;
  /** Indicates if the OS has been modified or "jailbroken." */
  modificationState?: string;
  /** The OS type on Apple platforms (iOS, iPadOS, etc.). */
  type?: string;
  /** The device category (mobile, tablet, desktop). */
  deviceType?: string;
  /** Formatted name and version number, suitable for passing to OperatingSystemFilter. */
  displayName?: string;
}

/** Developer-provided end user identifiers. */
export interface User {
  /** User id if provided by the app developer. */
  id?: string;
}

/** Developer-provided log lines recorded during the session. */
export interface Log {
  /** Device timestamp when the line was logged. */
  logTime: string;
  /** Log message. */
  message: string;
}

/** Analytics events recorded during the session. */
export interface Breadcrumb {
  /** Device timestamp for the event. */
  eventTime: string;
  /** Analytic event name. */
  title: string;
  /** Event parameters. */
  params: { [key: string]: string };
}

/** A frame in a stacktrace. */
export interface Frame {
  /** The line number in the file of the frame. */
  line?: number;
  /** The name of the source file in which the frame is found. */
  file?: string;
  /** The frame symbol after it has been deobfuscated or symbolicated. */
  symbol?: string;
  /** The byte offset into the binary image that contains the code. */
  offset?: number;
  /** The address in the binary image which contains the code. */
  address?: number;
  /** The display name of the library that includes the frame. */
  library?: string;
  /** One of DEVELOPER, VENDOR, RUNTIME, PLATFORM, or SYSTEM. */
  owner?: string;
  /** True when the Crashlytics analysis has determined that this frame is likely to be the cause of the error. */
  blamed?: boolean;
}

/** A Java exception and its stacktrace, only from Android apps. */
export interface Exception {
  /** The exception type e.g. java.lang.IllegalStateException. */
  type?: string;
  /** A message associated with the exception. */
  exceptionMessage?: string;
  /** True for all but the last-thrown exception (i.e. the first record). */
  nested?: boolean;
  /** The title of the exception. */
  title?: string;
  /** The subtitle of the exception. */
  subtitle?: string;
  /** True when the Crashlytics analysis has determined that this thread is where the fault occurred. */
  blamed?: boolean;
  /** The frames in the exception's stacktrace. */
  frames?: Frame[];
}

/** A non-fatal error and its stacktrace, only from Apple apps. */
export interface Error {
  /** The queue on which the thread was running. */
  queue?: string;
  /** Error code associated with the app's custom logged NSError. */
  code?: number;
  /** The title of the error. */
  title?: string;
  /** The subtitle of the error. */
  subtitle?: string;
  /** True when the Crashlytics analysis has determined that the stacktrace in this error is where the fault occurred. */
  blamed?: boolean;
  /** The frames in the error's stacktrace. */
  frames?: Frame[];
}

/** An application thread. */
export interface Thread {
  /** True when the thread has crashed. */
  crashed?: boolean;
  /** The name of the thread. */
  name?: string;
  /** The queue on which the thread was running. */
  queue?: string;
  /** The name of the signal that caused the app to crash. */
  signal?: string;
  /** The code of the signal that caused the app to crash. */
  signalCode?: string;
  /** The address of the signal that caused the application to crash. */
  crashAddress?: number;
  /** The title of the thread. */
  title?: string;
  /** The subtitle of the thread. */
  subtitle?: string;
  /** True when the Crashlytics analysis has determined that the stacktrace in this thread is where the fault occurred. */
  blamed?: boolean;
  /** The frames in the thread's stacktrace. */
  frames?: Frame[];
  /** The id of the thread, only available for ANR threads. */
  threadId?: number;
  /** The system id of the thread, only available for ANR threads. */
  sysThreadId?: number;
  /** The state of the thread at the time the ANR occurred. */
  threadState?: ThreadState;
}

/** Developer notes for an issue. */
export interface Note {
  /** Formatted like projects/{project}/apps/app/issues/{issue}/notes/{note} */
  name?: string;
  /** Time when this note was created. */
  createTime?: string;
  /** The email of the author of the note. */
  author?: string;
  /** The body of the note. */
  body?: string;
}

/** Sessions recorded by the Firebase App Quality Sessions SDK */
export interface FirebaseSessionEvent {
  /** Unique identifier for the Firebase session */
  sessionId?: string;
  /** Session event type. */
  eventType?: SessionEventType;
  /** The identifier of the first session since the last "cold start." */
  firstSessionId?: string;
  /** Indicates the number of sessions since the last cold start. */
  sessionIndex?: number;
  /** Uniquely identifies a device with Firebase apps installed. */
  firebaseInstallationId?: string;
  /** The start timestamp for the session event. */
  eventTime?: string;
  /** Mobile application version numbers. */
  version?: Version;
  /** Mobile device metadata. */
  device?: Device;
  /** Operating system and version. */
  operatingSystem?: OperatingSystem;
}

/** Represents the structure of the device_log entries in our cloud log stream. */
export interface DeviceLog {
  /** Crashlytics log */
  log?: Log;
  /** Crashlytics breadcrumb */
  breadcrumb?: Breadcrumb;
  /** The identifier of the event to which this is associated */
  eventId?: string;
}

/** Error types. */
export enum ErrorType {
  /** Unknown */
  ERROR_TYPE_UNSPECIFIED = "ERROR_TYPE_UNSPECIFIED",
  /** Fatal crash event. */
  FATAL = "FATAL",
  /** Non-fatal event, such as a caught Java exception or NSError on iOS. */
  NON_FATAL = "NON_FATAL",
  /** Application not responding error, Android only. */
  ANR = "ANR",
}

/** Enum type that describes the type of track. */
export enum TrackType {
  /** Unknown */
  TRACK_TYPE_UNSPECIFIED = "TRACK_TYPE_UNSPECIFIED",
  /** Production */
  TRACK_TYPE_PROD = "TRACK_TYPE_PROD",
  /** Internal testing */
  TRACK_TYPE_INTERNAL = "TRACK_TYPE_INTERNAL",
  /** Open testing */
  TRACK_TYPE_OPEN_TESTING = "TRACK_TYPE_OPEN_TESTING",
  /** Closed testing */
  TRACK_TYPE_CLOSED_TESTING = "TRACK_TYPE_CLOSED_TESTING",
  /** Early access */
  TRACK_TYPE_EARLY_ACCESS = "TRACK_TYPE_EARLY_ACCESS",
}

/** Device form factor. */
export enum FormFactor {
  /** Unknown */
  FORM_FACTOR_UNSPECIFIED = "FORM_FACTOR_UNSPECIFIED",
  /** Includes mobile phones, small foldables and other form factors not fitting the other categories. */
  PHONE = "PHONE",
  /** Includes tablets and larger foldables. */
  TABLET = "TABLET",
  /** Includes desktops, laptops, Chromebooks, etc. */
  DESKTOP = "DESKTOP",
  /** Includes televisions and set-tops */
  TV = "TV",
  /** Includes both watches and other wearables */
  WATCH = "WATCH",
}

/** Types of SessionEvent that are recorded */
export enum SessionEventType {
  /** Unknown */
  SESSION_EVENT_TYPE_UNKNOWN = "SESSION_EVENT_TYPE_UNKNOWN",
  /** Application session started */
  SESSION_START = "SESSION_START",
}

/** Issue states. */
export enum State {
  /** Unknown */
  STATE_UNSPECIFIED = "STATE_UNSPECIFIED",
  /** Ongoing issue. */
  OPEN = "OPEN",
  /** Issue resolved. */
  CLOSED = "CLOSED",
  /** Issue muted. No alerts will be fired for this issue. */
  MUTED = "MUTED",
}

/** All supported signal names. */
export enum Signal {
  /** Default */
  SIGNAL_UNSPECIFIED = "SIGNAL_UNSPECIFIED",
  /** Indicates an issue that is impacting end users early in the app session. */
  SIGNAL_EARLY = "SIGNAL_EARLY",
  /** Indicates newly detected issues. */
  SIGNAL_FRESH = "SIGNAL_FRESH",
  /** Indicates previously closed issues which have been detected again. */
  SIGNAL_REGRESSED = "SIGNAL_REGRESSED",
  /** Indicates issues impacting some end users multiple times. */
  SIGNAL_REPETITIVE = "SIGNAL_REPETITIVE",
}

/** The state of a thread when the ANR occurred. */
export enum ThreadState {
  /** Thread state unspecified. */
  STATE_UNSPECIFIED = "STATE_UNSPECIFIED",
  /** Thread was terminated. */
  THREAD_STATE_TERMINATED = "THREAD_STATE_TERMINATED",
  /** Thread was runnable. */
  THREAD_STATE_RUNNABLE = "THREAD_STATE_RUNNABLE",
  /** Thread was waiting with a timeout. */
  THREAD_STATE_TIMED_WAITING = "THREAD_STATE_TIMED_WAITING",
  /** Thread was blocked. */
  THREAD_STATE_BLOCKED = "THREAD_STATE_BLOCKED",
  /** Thread was waiting. */
  THREAD_STATE_WAITING = "THREAD_STATE_WAITING",
  /** Thread was started, yet to run anything. */
  THREAD_STATE_NEW = "THREAD_STATE_NEW",
  /** The thread was native and we could not heuristically determine that it was was waiting, so assume it's runnable. */
  THREAD_STATE_NATIVE_RUNNABLE = "THREAD_STATE_NATIVE_RUNNABLE",
  /** We heuristically determined that the thread is waiting. */
  THREAD_STATE_NATIVE_WAITING = "THREAD_STATE_NATIVE_WAITING",
}

/** Request message for the ListEvents method. */
export interface ListEventsRequest {
  /** The maximum number of events per page. If omitted, defaults to 10. */
  pageSize?: number;
  /** A page token, received from a previous calls. */
  pageToken?: string;
  /** Filter only the desired events. */
  filter?: EventFilters;
}

/** Response message for the ListEvents method. */
export interface ListEventsResponse {
  /** Returns one element per event, ordered descending by the event timestamp. */
  events?: Event[];
  /** A pagination token to retrieve the next page of events. */
  nextPageToken?: string;
}

/** Request message for the BatchGetEvents method. */
export interface BatchGetEventsRequest {
  /**
   * The resource names of the desired events.
   * A maximum of 100 events can be retrieved in a batch.
   * Format: "projects/{project}/apps/{app_id}/events/{event_id}"
   */
  names: string[];
}

/** Response message for the BatchGetEvents method. */
export interface BatchGetEventsResponse {
  /** Returns one or more events. */
  events?: Event[];
}

/**
 * Filters for ListEvents method.
 * Multiple conditions for the same field are combined in an ‘OR’ expr
 * and different fields are combined with ‘AND’.
 * All fields are optional.
 */
export interface EventFilters {
  /** Fetch only events which occurred during the time interval. */
  interval?: Interval;
  /** Fetch only events from the given application versions. */
  version?: VersionFilter;
  /** Fetch only events with the desired issue characteristics. */
  issue?: IssueFilter;
  /** Fetch only events from the given operating system versions. */
  operatingSystem?: OperatingSystemFilter;
  /** Fetch only events from the given device models. */
  device?: DeviceFilter;
}

/** Represents a time interval, encoded as a Timestamp start and end. */
export interface Interval {
  /** Start of the interval. */
  startTime: string; // Timestamp
  /** End of the interval. */
  endTime: string; // Timestamp
}

/**
 * Version-based filters relevant in event reports.
 * These fields correspond exactly to those in the Version type.
 * For best results, use a [Version.display_name][] obtained from a topVersions
 * report, rather than manually constructing its display_name.
 */
export interface VersionFilter {
  /**
   * Count only events in the given app version.
   * This string matches [Version.display_name][].
   * Formatted like "display_version (build_version)" eg "1.2.3 (456)"
   */
  displayNames: string[];
}

/**
 * Issue-based filters relevant in event reports.
 * These fields correspond exactly to those in the Issue type.
 * All fields are optional.
 */
export interface IssueFilter {
  /**
   * Count only events in the given issue id.
   * This field matches [Issue.id].
   */
  id?: string;
  /**
   * Count only events for the given issue variant id.
   * This field matches [IssueVariant.id].
   */
  variantId?: string;
  /**
   * Count only events of the given error types.
   * This field matches [Issue.error_type].
   */
  errorTypes?: ErrorType[];
  /**
   * Return only issues currently marked with the given signals.
   * This field matches [Issue.signals.signal].
   */
  signals?: Signal[];
}

/**
 * Operating system-based filters relevant in event reports.
 * These fields correspond exactly to those in the OperatingSystem type.
 * For best results, use a [OperatingSystem.display_name][] obtained from a
 * topOperatingSystems report, rather than manually constructing its
 * display_name.
 */
export interface OperatingSystemFilter {
  /**
   * Count only events in the given operating system and version.
   * This string matches [OperatingSystem.display_name][].
   * Formatted like "osName (osVersion)" e.g. "Android (11)"
   * or just "osName" for all versions, e.g. simply "iPadOS".
   */
  displayNames: string[];
}

/**
 * Device model filters relevant in event reports.
 * These fields correspond exactly to those in the Device type.
 * For best results, use a [Device.display_name][] obtained from a
 * topAndroidDevices or topIosDevices report, rather than manually
 * constructing its display_name.
 */
export interface DeviceFilter {
  /**
   * Count only events from the given Device model.
   * This string matches [Device.display_name][].
   * Formatted like "manufacturer (model)" e.g. "Google (Pixel 6)",
   * or just "manufacturer" for all possible models, e.g. simply "Google".
   * Note that a device's marketing_name field can not be used for filtering.
   */
  displayNames: string[];
  /**
   * Count only events from devices with the given form factor (eg phone or
   * tablet). This field matches [Device.form_factor].
   */
  formFactors?: FormFactor[];
}

/** The request method for the GetReport method. */
export interface GetReportRequest {
  /** Filters to customize the report. */
  filter?: ReportFilters;
  /** The maximum number of result groups to return. If omitted, defaults to 25. */
  pageSize?: number;
  /** A page token, received from a previous calls. */
  pageToken?: string;
}

/** Response message for the GetReport method. */
export interface Report {
  /** Aggregate event statistics in the report will be grouped by a dimension, such as by issue or by version. */
  groups?: ReportGroup[];
  /** A page token to use to retrieve additional report groups. */
  nextPageToken?: string;
  /** The total number of groups retrievable by the request. */
  totalSize?: number;
  /** The name of the report. */
  name?: string;
  /** The displayable title of the report. */
  displayName?: string;
  /** Usage instructions for the report and a description of the result metrics. */
  usage?: string;
}

/**
 * Filters for all reports.
 * Multiple conditions for the same field are combined in an ‘OR’ expr
 * and different fields are combined with ‘AND’.
 * All fields are optional.
 */
export interface ReportFilters {
  /** Count only events which occurred during the time interval. */
  interval?: Interval;
  /** Count only events from the given application versions. */
  version?: VersionFilter;
  /** Count only events with the desired issue characteristics. */
  issue?: IssueFilter;
  /** Count only events from the given operating system versions. */
  operatingSystem?: OperatingSystemFilter;
  /** Count only events from the given device models. */
  device?: DeviceFilter;
}

/** Request message for the UpdateIssue method. */
export interface UpdateIssueRequest {
  /** Only the "state" field is mutable. */
  state: State;
}
