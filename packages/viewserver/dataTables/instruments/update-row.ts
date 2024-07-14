export default function updateRow(idx, row, columnMap) {
    const colIdx = columnMap['Price']
    const direction = Math.random() > 0.5 ? 1 : -1;
    return [colIdx, row[colIdx] * (1 + direction * Math.random() / 10)];
}
