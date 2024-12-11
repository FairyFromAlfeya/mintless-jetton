import { Address, toNano, Cell } from "@ton/core";

export const randomAddress = (wc: number = 0) => {
  const buf = Buffer.alloc(32);
  for (let i = 0; i < buf.length; i++) {
    buf[i] = Math.floor(Math.random() * 256);
  }
  return new Address(wc, buf);
};

export const differentAddress = (old: Address) => {
  let newAddr: Address;
  do {
    newAddr = randomAddress(old.workChain);
  } while (newAddr.equals(old));

  return newAddr;
};

const getRandom = (min: number, max: number) => {
  return Math.random() * (max - min) + min;
};

export const getRandomInt = (min: number, max: number) => {
  return Math.round(getRandom(min, max));
};

export const getRandomTon = (min: number, max: number): bigint => {
  return toNano(getRandom(min, max).toFixed(9));
};

export const buff2bigint = (buff: Buffer): bigint => {
  return BigInt("0x" + buff.toString("hex"));
};

export type InternalTransfer = {
  from: Address | null;
  response: Address | null;
  amount: bigint;
  forwardAmount: bigint;
  payload: Cell | null;
};

export const parseInternalTransfer = (body: Cell) => {
  const ts = body.beginParse().skip(64 + 32);

  return {
    amount: ts.loadCoins(),
    from: ts.loadAddressAny(),
    response: ts.loadAddressAny(),
    forwardAmount: ts.loadCoins(),
    payload: ts.loadMaybeRef(),
  };
};

const testPartial = (cmp: any, match: any) => {
  for (let key in match) {
    if (!(key in cmp)) {
      throw Error(`Unknown key ${key} in ${cmp}`);
    }

    if (match[key] instanceof Address) {
      if (!(cmp[key] instanceof Address)) {
        return false;
      }
      if (!(match[key] as Address).equals(cmp[key])) {
        return false;
      }
    } else if (match[key] instanceof Cell) {
      if (!(cmp[key] instanceof Cell)) {
        return false;
      }
      if (!(match[key] as Cell).equals(cmp[key])) {
        return false;
      }
    } else if (match[key] !== cmp[key]) {
      return false;
    }
  }
  return true;
};

export const testJettonInternalTransfer = (body: Cell, match: Partial<InternalTransfer>) => {
  const res = parseInternalTransfer(body);
  return testPartial(res, match);
};
