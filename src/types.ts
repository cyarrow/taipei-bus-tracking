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
  }[];
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
}

export interface Credentials {
  clientId: string;
  clientSecret: string;
}
