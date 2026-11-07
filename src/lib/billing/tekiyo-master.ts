// Server only. 公開マスター本体はコミットしない。UIは結果の型だけをimportする。
import { loadMaster } from "../masters/server";
import { tekiyoMasterRows } from "./tekiyo";
export const loadTekiyoMaster = () => tekiyoMasterRows(loadMaster("c").rows);
