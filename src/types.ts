export type City = 'Taipei' | 'NewTaipei';

export const CITY_LABEL: Record<City, string> = {
  Taipei: '台北市',
  NewTaipei: '新北市',
};

export interface NameType {
  Zh_tw: string;
  En?: string;
}

/** TDX StopOfRoute 回傳的一筆資料（某路線、某子路線、某方向的站序） */
export interface StopOfRoute {
  RouteUID: string;
  RouteName: NameType;
  SubRouteUID: string;
  SubRouteName: NameType;
  Direction: number;
  Stops: {
    StopUID: string;
    StopName: NameType;
    StopSequence: number;
    /** 站位 ID：同一個實體站位上不同路線的站牌會共用 */
    StationID?: string;
    StopPosition?: Position;
  }[];
}

export interface Position {
  PositionLat: number;
  PositionLon: number;
}

/** TDX RealTimeByFrequency：公車 GPS 位置 */
export interface BusGps {
  PlateNumb: string;
  RouteUID: string;
  RouteName: NameType;
  Direction: number;
  BusPosition?: Position;
  GPSTime?: string;
}

/** TDX Station：實體站位，含經過的路線 */
export interface Station {
  StationUID: string;
  StationID: string;
  StationName: NameType;
  StationPosition: Position;
  Stops: {
    StopUID: string;
    StopName: NameType;
    RouteUID: string;
    RouteName: NameType;
  }[];
}

export interface Shape {
  RouteUID: string;
  Direction?: number;
  Geometry: string;
}

/** 路線清單（搜尋建議用） */
export interface RouteInfo {
  city: City;
  routeUID: string;
  routeName: string;
  departure: string;
  destination: string;
}

/** TDX RealTimeNearStop：公車目前在哪一站 */
export interface BusPosition {
  PlateNumb: string;
  RouteUID: string;
  RouteName: NameType;
  Direction: number;
  StopUID: string;
  StopSequence: number;
  /** 0 離站 1 進站 */
  A2EventType?: number;
}

/** TDX EstimatedTimeOfArrival 回傳的一筆資料 */
export interface Eta {
  StopUID: string;
  RouteUID: string;
  RouteName: NameType;
  SubRouteUID?: string;
  Direction: number;
  /** 預估到站秒數 */
  EstimateTime?: number;
  /** 0 正常 1 尚未發車 2 交管不停靠 3 末班車已過 4 今日未營運 */
  StopStatus: number;
  NextBusTime?: string;
  PlateNumb?: string;
  UpdateTime?: string;
}

/** 使用者收藏的站牌 */
export interface FavoriteStop {
  id: string;
  city: City;
  routeUID: string;
  routeName: string;
  direction: number;
  /** 顯示用，例如「往 捷運南京三民站」 */
  headsign: string;
  stopUID: string;
  stopName: string;
  /** 站位 ID，用來合併同一站的多條路線 */
  stationID?: string;
  groupId?: string;
  lat?: number;
  lon?: number;
}

export interface Group {
  id: string;
  name: string;
  /** 自動切換時段，格式 HH:MM */
  start?: string;
  end?: string;
}

export interface Settings {
  /** 首頁顯示步行時間與建議出門時間 */
  walkHint: boolean;
}

export interface Credentials {
  clientId: string;
  clientSecret: string;
}
