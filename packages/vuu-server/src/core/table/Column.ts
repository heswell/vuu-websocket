import { VuuColumnDataType } from "@vuu-ui/vuu-protocol-types";

// TODO
const isVuuColumnDataType = (dt: string): dt is VuuColumnDataType => true;

export class Columns {
    static fromNames(...columns: string[]) {
        return columns.map((nameAndDt, index) => {
            const [name, dataType] = nameAndDt.split(":");
            if (isVuuColumnDataType(dataType)) {
                return new SimpleColumn(name, dataType, index);
            }
            throw Error(`column ${name} had invalid dataType ${dataType}`)
        })
    }
}

export interface Column {
    dataType: VuuColumnDataType;
    index: number;
    name: string;
}

class SimpleColumn implements Column {
    constructor(public name: string, public dataType: VuuColumnDataType, public index: number) { }
}