import { Cell, Slice, beginCell, Dictionary, DictionaryValue, Transaction } from "@ton/core";

export type GasPrices = {
  flat_gas_limit: bigint;
  flat_gas_price: bigint;
  gas_price: bigint;
};
export type StorageValue = {
  utime_sice: number;
  bit_price_ps: bigint;
  cell_price_ps: bigint;
  mc_bit_price_ps: bigint;
  mc_cell_price_ps: bigint;
};

export type MsgPrices = ReturnType<typeof configParseMsgPrices>;
export type FullFees = ReturnType<typeof computeFwdFeesVerbose>;

export class StorageStats {
  bits: bigint;
  cells: bigint;

  constructor(bits?: number | bigint, cells?: number | bigint) {
    this.bits = bits !== undefined ? BigInt(bits) : 0n;
    this.cells = cells !== undefined ? BigInt(cells) : 0n;
  }

  toString(): string {
    return JSON.stringify({
      bits: this.bits.toString(),
      cells: this.cells.toString(),
    });
  }
}

export function computedGeneric<T extends Transaction>(transaction: T) {
  if (transaction.description.type !== "generic") throw "Expected generic transaction action";
  if (transaction.description.computePhase.type !== "vm") throw "Compute phase expected";
  return transaction.description.computePhase;
}

export function storageGeneric<T extends Transaction>(transaction: T) {
  if (transaction.description.type !== "generic") throw "Expected generic transaction action";
  const storagePhase = transaction.description.storagePhase;
  if (storagePhase === null || storagePhase === undefined) throw "Storage phase expected";
  return storagePhase;
}

function shr16ceil(src: bigint) {
  let rem = src % BigInt(65536);
  let res = src / 65536n; // >> BigInt(16);
  if (rem != BigInt(0)) {
    res += BigInt(1);
  }
  return res;
}

export function collectCellStats(cell: Cell, visited: Array<string>, skipRoot: boolean = false): StorageStats {
  let bits = skipRoot ? 0n : BigInt(cell.bits.length);
  let cells = skipRoot ? 0n : 1n;
  let hash = cell.hash().toString();
  if (visited.includes(hash)) {
    // We should not account for current cell data if visited
    return new StorageStats();
  } else {
    visited.push(hash);
  }
  for (let ref of cell.refs) {
    let r = collectCellStats(ref, visited);
    cells += r.cells;
    bits += r.bits;
  }
  return new StorageStats(bits, cells);
}

export function getGasPrices(configRaw: Cell, workchain: 0 | -1): GasPrices {
  const config = configRaw.beginParse().loadDictDirect(Dictionary.Keys.Int(32), Dictionary.Values.Cell());

  const ds = config.get(21 + workchain)!.beginParse();
  if (ds.loadUint(8) !== 0xd1) {
    throw new Error("Invalid flat gas prices tag!");
  }

  const flat_gas_limit = ds.loadUintBig(64);
  const flat_gas_price = ds.loadUintBig(64);

  if (ds.loadUint(8) !== 0xde) {
    throw new Error("Invalid gas prices tag!");
  }
  return {
    flat_gas_limit,
    flat_gas_price,
    gas_price: ds.preloadUintBig(64),
  };
}

export function setGasPrice(configRaw: Cell, prices: GasPrices, workchain: 0 | -1): Cell {
  const config = configRaw.beginParse().loadDictDirect(Dictionary.Keys.Int(32), Dictionary.Values.Cell());
  const idx = 21 + workchain;
  const ds = config.get(idx)!;
  const tail = ds.beginParse().skip(8 + 64 + 64 + 8 + 64);

  const newPrices = beginCell()
    .storeUint(0xd1, 8)
    .storeUint(prices.flat_gas_limit, 64)
    .storeUint(prices.flat_gas_price, 64)
    .storeUint(0xde, 8)
    .storeUint(prices.gas_price, 64)
    .storeSlice(tail)
    .endCell();
  config.set(idx, newPrices);

  return beginCell().storeDictDirect(config).endCell();
}

export const storageValue: DictionaryValue<StorageValue> = {
  serialize: (src, builder) => {
    builder
      .storeUint(0xcc, 8)
      .storeUint(src.utime_sice, 32)
      .storeUint(src.bit_price_ps, 64)
      .storeUint(src.cell_price_ps, 64)
      .storeUint(src.mc_bit_price_ps, 64)
      .storeUint(src.mc_cell_price_ps, 64);
  },
  parse: (src) => {
    return {
      utime_sice: src.skip(8).loadUint(32),
      bit_price_ps: src.loadUintBig(64),
      cell_price_ps: src.loadUintBig(64),
      mc_bit_price_ps: src.loadUintBig(64),
      mc_cell_price_ps: src.loadUintBig(64),
    };
  },
};

export function getStoragePrices(configRaw: Cell) {
  const config = configRaw.beginParse().loadDictDirect(Dictionary.Keys.Int(32), Dictionary.Values.Cell());
  const storageData = Dictionary.loadDirect(Dictionary.Keys.Uint(32), storageValue, config.get(18)!);
  const values = storageData.values();

  return values[values.length - 1];
}
export function calcStorageFee(prices: StorageValue, stats: StorageStats, duration: bigint) {
  return shr16ceil((stats.bits * prices.bit_price_ps + stats.cells * prices.cell_price_ps) * duration);
}
export function setStoragePrices(configRaw: Cell, prices: StorageValue) {
  const config = configRaw.beginParse().loadDictDirect(Dictionary.Keys.Int(32), Dictionary.Values.Cell());
  const storageData = Dictionary.loadDirect(Dictionary.Keys.Uint(32), storageValue, config.get(18)!);
  storageData.set(storageData.values().length - 1, prices);
  config.set(18, beginCell().storeDictDirect(storageData).endCell());
  return beginCell().storeDictDirect(config).endCell();
}

export function computeGasFee(prices: GasPrices, gas: bigint): bigint {
  if (gas <= prices.flat_gas_limit) {
    return prices.flat_gas_price;
  }
  return prices.flat_gas_price + (prices.gas_price * (gas - prices.flat_gas_limit)) / 65536n;
}

export const configParseMsgPrices = (sc: Slice) => {
  let magic = sc.loadUint(8);

  if (magic != 0xea) {
    throw Error("Invalid message prices magic number!");
  }
  return {
    lumpPrice: sc.loadUintBig(64),
    bitPrice: sc.loadUintBig(64),
    cellPrice: sc.loadUintBig(64),
    ihrPriceFactor: sc.loadUintBig(32),
    firstFrac: sc.loadUintBig(16),
    nextFrac: sc.loadUintBig(16),
  };
};

export const setMsgPrices = (configRaw: Cell, prices: MsgPrices, workchain: 0 | -1) => {
  const config = configRaw.beginParse().loadDictDirect(Dictionary.Keys.Int(32), Dictionary.Values.Cell());

  const priceCell = beginCell()
    .storeUint(0xea, 8)
    .storeUint(prices.lumpPrice, 64)
    .storeUint(prices.bitPrice, 64)
    .storeUint(prices.cellPrice, 64)
    .storeUint(prices.ihrPriceFactor, 32)
    .storeUint(prices.firstFrac, 16)
    .storeUint(prices.nextFrac, 16)
    .endCell();
  config.set(25 + workchain, priceCell);

  return beginCell().storeDictDirect(config).endCell();
};

export const getMsgPrices = (configRaw: Cell, workchain: 0 | -1) => {
  const config = configRaw.beginParse().loadDictDirect(Dictionary.Keys.Int(32), Dictionary.Values.Cell());

  const prices = config.get(25 + workchain);

  if (prices === undefined) {
    throw Error("No prices defined in config");
  }

  return configParseMsgPrices(prices.beginParse());
};

export function computeFwdFees(msgPrices: MsgPrices, cells: bigint, bits: bigint) {
  return msgPrices.lumpPrice + shr16ceil(msgPrices.bitPrice * bits + msgPrices.cellPrice * cells);
}

export function computeFwdFeesVerbose(msgPrices: MsgPrices, cells: bigint | number, bits: bigint | number) {
  const fees = computeFwdFees(msgPrices, BigInt(cells), BigInt(bits));

  const res = (fees * msgPrices.firstFrac) >> 16n;
  return {
    total: fees,
    res,
    remaining: fees - res,
  };
}
