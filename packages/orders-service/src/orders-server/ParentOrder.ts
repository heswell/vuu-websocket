import { ParentOrderDto } from "./order-service-types";
import { EventEmitter } from "@vuu-ui/vuu-utils";

export type OrderMessageEvents = {
  update: (evt: { orderId: string; type: "fill" | "cancel" }) => void;
};

export class ParentOrder
  extends EventEmitter<OrderMessageEvents>
  implements ParentOrderDto
{
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
  ) {
    super();
  }

  fill(quantity: number) {
    this.filledQuantity += quantity;
    if (this.filledQuantity >= this.quantity) {
      this.status = "FILLED";
    } else if (this.status === "NEW") {
      this.status = "PARTIAL";
    }
    this.emit("update", { orderId: this.id, type: "fill" });
  }

  cancel() {
    this.status = "CANCELLED";
    this.emit("update", { orderId: this.id, type: "cancel" });
  }
}
