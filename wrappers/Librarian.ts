import { Address, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from "@ton/core";

export type LibrarianConfig = {
  code: Cell;
};

export function librarianConfigToCell(config: LibrarianConfig): Cell {
  return config.code;
}
export class Librarian implements Contract {
  constructor(readonly address: Address) {}

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
    });
  }

  static createFromConfig(config: LibrarianConfig, code: Cell, workchain = -1) {
    const data = librarianConfigToCell(config);
    const init = { code, data };
    return new Librarian(contractAddress(workchain, init));
  }
}
