export class FieldDefString extends String {
    constructor(str: string) {
        super(str);
    }

    double(): String {
        return this + ":Double"
    }

    long(): String {
        return this + ":Long"
    }

    boolean(): String {
        return this + ":Boolean"
    }

    char(): String {
        return this + ":Char"
    }


    int(): String {
        return this + ":Int"
    }

    string(): String {
        return this + ":String"
    }

    epochTimestamp(): String {
        return this + ":EpochTimestamp"
    }

    scaledDecimal2(): String {
        return this + ":ScaledDecimal2"
    }

    scaledDecimal4(): String {
        return this + ":ScaledDecimal4"
    }

    scaledDecimal6(): String {
        return this + ":ScaledDecimal6"
    }

    scaledDecimal8(): String {
        return this + ":ScaledDecimal8"
    }

}