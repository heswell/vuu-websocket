export interface ParentOrderDto {
  id: string;
  side: string;
  status: "NEW" | "PARTIAL" | "FILLED" | "CANCELLED";
  ric: string;
  algo: string;
  ccy: string;
  quantity: number;
  filledQuantity: number;
  account: string;
  trader: string;
  created: number;
  lastUpdated: number;
  column13: number;
  column14: number;
  column15: number;
  column16: number;
  column17: number;
  column18: number;
  column19: number;
  column20: number;
  column21: number;
  column22: number;
  column23: number;
  column24: number;
  column25: number;
  column26: number;
  column27: number;
  column28: number;
  column29: number;
  column30: number;
  column31: number;
  column32: number;
  column33: number;
  column34: number;
  column35: number;
  column36: number;
  column37: number;
  column38: number;
  column39: number;
  column40: number;
}

export class ParentOrder implements ParentOrderDto {
  constructor(
    public id: string,
    public side: string,
    public status: ParentOrderDto["status"],
    public ric: string,
    public algo: string,
    public ccy: string,
    public quantity: number,
    public filledQuantity: number,
    public account: string,
    public trader: string,
    public created: number,
    public lastUpdated: number,
    public column13: number,
    public column14: number,
    public column15: number,
    public column16: number,
    public column17: number,
    public column18: number,
    public column19: number,
    public column20: number,
    public column21: number,
    public column22: number,
    public column23: number,
    public column24: number,
    public column25: number,
    public column26: number,
    public column27: number,
    public column28: number,
    public column29: number,
    public column30: number,
    public column31: number,
    public column32: number,
    public column33: number,
    public column34: number,
    public column35: number,
    public column36: number,
    public column37: number,
    public column38: number,
    public column39: number,
    public column40: number
  ) {}
}
