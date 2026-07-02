export type CheckInRequest = {
  merchantId?: string;
  latitude?: string;
  longitude?: string;
  address?: string;
};

export type TrackPointInput = {
  latitude?: string;
  longitude?: string;
  recordedAt?: string;
  accuracy?: string;
  speed?: string;
};

export type UploadTrackPointsRequest = {
  points?: TrackPointInput[];
};
