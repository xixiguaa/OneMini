export type JobStatus = 'WAIT' | 'RUN' | 'DONE' | 'FAIL'

export interface File3D {
  Type: string
  Url: string
  PreviewImageUrl?: string
}

export interface SubmitJobResponse {
  JobId: string
  RequestId?: string
}

export interface QueryJobResponse {
  Status: JobStatus
  ErrorCode?: string
  ErrorMessage?: string
  ResultFile3Ds?: File3D[]
  ResultCreditConsumed?: number
  ResultCreditDetails?: string
  RequestId?: string
}
