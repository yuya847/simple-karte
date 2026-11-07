// Server only. 公開マスター本体はコミットしない。UIは結果の型だけをimportする。
import { loadMaster } from "../masters/server";
import { tekiyoMasterRows, type TekiyoMaster } from "./tekiyo";
let cache: TekiyoMaster[] | undefined;
/** 病棟の全員のレセプトで何度も呼ばれるので、読んだ行を使い回す。 */
export const loadTekiyoMaster = () => (cache ??= tekiyoMasterRows(loadMaster("c").rows));
