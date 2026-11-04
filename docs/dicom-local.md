# 手元で DICOM の流れを試す（Orthanc と dcm4che）

Simple Karte の放射線部は、撮影装置にも画像サーバにもつないでいません。アプリの中の「撮影装置（模擬）」が、ワークリストの取得・実施の通知（MPPS）・画像の保存をまねています。ここでは、同じ流れを自分のコンピュータで、無料のソフトを使って試す方法を書きます。

- **架空の患者だけで試します。** 実在の患者の名前・画像・病院のデータは入れません。
- **手元のコンピュータの中だけで動かします。** Orthanc をネットワークに公開しません（下の設定は localhost だけ・認証なし）。
- Vercel の本番では使いません（アプリの側のアダプタは、Vercel では必ず止まります）。

## 役わり

| 実際の病院では | ここで使うもの | DICOM の働き |
|---|---|---|
| RIS（放射線情報システム）がワークリストを出す | Orthanc の Worklists プラグイン | MWL（Modality Worklist）の C-FIND に答える |
| 撮影装置がワークリストを取る | dcm4che の `findscu` | MWL の C-FIND を送る |
| 撮影装置が「始めた・終わった」を知らせる | dcm4che の `mppsscu` | MPPS の N-CREATE（IN PROGRESS）と N-SET（COMPLETED） |
| RIS が実施の知らせを受ける | dcm4che の `mppsscp` | MPPS を受けてファイルに残す |
| 撮影装置が画像を送る | dcm4che の `storescu` | C-STORE |
| PACS（画像の保管） | Orthanc 本体と DICOMweb プラグイン | C-STORE を受ける、QIDO-RS で検査を探す |

Orthanc の Worklists プラグインの説明には MPPS がないので、MPPS は dcm4che の `mppsscp` で受けて中身を見ます。

## 1. 入れるもの

- Orthanc（無料。Worklists プラグインと DICOMweb プラグインを一緒に入れる）：https://orthanc.uclouvain.be/book/
  - Worklists プラグイン：https://orthanc.uclouvain.be/book/plugins/worklists-plugin-new.html
  - DICOMweb プラグイン：https://orthanc.uclouvain.be/book/plugins/dicomweb.html
- dcm4che のコマンドラインツール（無料。`findscu`・`storescu`・`mppsscu`・`mppsscp`・`jpg2dcm` が入っている）：https://github.com/dcm4che/dcm4che （Java が要ります）

## 2. Orthanc の設定（例：`orthanc.json`）

```json
{
  "Name": "SimpleKarteLocal",
  "DicomAet": "ORTHANC",
  "DicomPort": 4242,
  "HttpPort": 8042,
  "RemoteAccessAllowed": false,
  "AuthenticationEnabled": false,
  "Plugins": ["（Worklists と DICOMweb のプラグインがあるフォルダ）"],
  "Worklists": {
    "Enable": true,
    "FilterIssuerAet": true,
    "Directory": "./WorklistsDatabase"
  },
  "DicomWeb": { "Enable": true, "Root": "/dicom-web/" },
  "DicomModalities": {
    "ct1": ["SK_CT1", "127.0.0.1", 11113],
    "dr1": ["SK_DR1", "127.0.0.1", 11114],
    "porta": ["SK_PORTA", "127.0.0.1", 11115],
    "mr1": ["SK_MR1", "127.0.0.1", 11116]
  }
}
```

- `SK_CT1` などは、この架空の病院の装置の AE タイトル（放射線部の画面の「撮影室・装置」と同じ。`src/lib/ris.ts` の `RIS_ROOMS`）。
- `FilterIssuerAet` を `true` にすると、ワークリストを問い合わせた装置の AE タイトルに割り当てた検査だけが返ります。
- `RemoteAccessAllowed: false` と `AuthenticationEnabled: false` は、手元で試すときだけの設定です。ほかのコンピュータから見える場所では使いません。

起動：`Orthanc orthanc.json`（Windows は `Orthanc.exe orthanc.json`）。ブラウザで http://localhost:8042 が開けば動いています。

## 3. Simple Karte からワークリストを送る

1. Simple Karte の `.env.local` に次の1行を書きます（鍵やパスワードではありません。リポジトリには入れません）。

   ```
   LOCAL_ORTHANC_URL=http://localhost:8042
   ```

2. `npm run dev` で開発サーバーを立てます。アダプタ（`src/lib/dicomweb.ts`、`/api/dicom`）は、この値があって、localhost で、Vercel でないときだけ動きます。URL に利用者名・パスワードを入れると止まります。
3. 右上の「自分」で「診療放射線技師」を選び、場所「放射線部」の「受付・割り当て」で検査を受付し、装置を割り当てます。
4. 「撮影装置（模擬）」で装置（例：SK_CT1）を選び、ワークリストを開いて「手元の Orthanc に送る」を押します。中では Orthanc の `POST /worklists/create` に `{"Tags": {...}}` を送っています（`toOrthancTags`）。

アプリを使わずに試すときは、画面の「Orthanc の形の JSON」を写して、同じものを curl で送れます。

```sh
curl --request POST http://localhost:8042/worklists/create --data @worklist.json
curl --request GET "http://localhost:8042/worklists/?format=Simplify"
```

## 4. 装置の側を dcm4che でまねる

### ワークリストを取る（MWL の C-FIND）

```sh
findscu -b SK_CT1 -c ORTHANC@localhost:4242 -M MWL \
  -m 00400100.00400001=SK_CT1 \
  -r PatientName -r PatientID -r PatientBirthDate -r PatientSex \
  -r AccessionNumber -r StudyInstanceUID -r RequestedProcedureDescription \
  -r 00400100.00400002 -r 00400100.00400003 -r 00400100.00080060
```

- `-b` は自分（装置）の AE タイトル、`-c` は相手（Orthanc）、`-M MWL` はワークリストの問い合わせ、`-m` は絞る条件、`-r` は返してほしい属性です。
- `00400100.00400001` は Scheduled Procedure Step Sequence (0040,0100) の中の Scheduled Station AE Title (0040,0001) です。返る属性は DICOM PS3.4 の Table K.6-1 のとおりです。

### 実施の知らせ（MPPS）を受ける側を立てる

```sh
mkdir -p mpps
mppsscp -b MPPSSCP:11112 --directory ./mpps
```

### 画像を作って送る（C-STORE）

実在の患者の画像は使いません。架空の絵（図形などの JPEG）を、ワークリストで受け取った値で DICOM にします。

```sh
jpg2dcm -m PatientID=90010260 -m PatientName="=森^久美子=モリ^クミコ" -m "SpecificCharacterSet=ISO_IR 192" \
  -m StudyInstanceUID=（ワークリストの StudyInstanceUID） -m AccessionNumber=（ワークリストの AccessionNumber） \
  -m Modality=CT -- shape.jpg images/img1.dcm
storescu -b SK_CT1 -c ORTHANC@localhost:4242 images/
```

### 実施の知らせ（MPPS）を送る

```sh
mppsscu -b SK_CT1 -c MPPSSCP@localhost:11112 images/
```

`mppsscu` は、渡した画像から MPPS を作り、N-CREATE（IN PROGRESS）と N-SET（COMPLETED）を送ります。中止を送るときは `--dc` を付けます（DISCONTINUED）。受けた MPPS は `./mpps` にファイルで残ります（`dcmdump` で中身を見られます）。

- いまの DICOM 規格では、MPPS に線量を入れる属性（Radiation Dose Module）は廃止されています（PS3.4 F.7.2 の注6）。線量は X線線量の構造化報告（RDSR）で送ります。このガイドでは RDSR は扱いません。アプリの模擬装置は、CT の線量を RDSR の Mean CTDIvol (113830, DCM)・DLP (113838, DCM) の形で見せています。

## 5. 画像が届いたか確かめる（QIDO-RS）

```sh
curl -H "Accept: application/dicom+json" "http://localhost:8042/dicom-web/studies?PatientID=90010260"
```

アプリの「撮影装置（模擬）」の「手元の Orthanc の検査を探す」も、同じ QIDO-RS を `/api/dicom?patientId=…` から送ります。

## 出典

- DICOM PS3.4 K.6（Modality Worklist Information Model、Table K.6-1）：https://dicom.nema.org/medical/dicom/current/output/chtml/part04/sect_K.6.html
- DICOM PS3.4 F.7.2（MPPS の N-CREATE・N-SET の属性、Table F.7.2-1）：https://dicom.nema.org/medical/dicom/current/output/chtml/part04/sect_F.7.2.html
- DICOM PS3.6（タグ・キーワード・VR）：https://dicom.nema.org/medical/dicom/current/output/chtml/part06/chapter_6.html
- DICOM PS3.16 TID 10013（CT の線量）：https://dicom.nema.org/medical/dicom/current/output/chtml/part16/sect_tid_10013.html
- Orthanc Book（Worklists プラグイン・DICOMweb プラグイン）：上の URL
- dcm4che の各ツールの使い方は `findscu --help` などで出ます（説明の文は https://github.com/dcm4che/dcm4che の `dcm4che-tool` の各フォルダ）。

ここに書いたコマンドは、2026-11-04 に各ツールの公開文書で引数の名前を確かめたものです。手元で実際に動かしてはいません。版によって設定の名前が変わることがあるので、動かないときは各ツールの説明を見てください。
