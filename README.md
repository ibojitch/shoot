# ORBIT — 2.5D Shooter

Three.jsで描画する、X/Y平面の横スクロールシューティングMVP。ビルド、npm、画像素材は不要です。

## 起動

Windowsでは、このフォルダで `powershell -ExecutionPolicy Bypass -File .\start.ps1` を実行し、ブラウザで `http://localhost:8000` を開いてください。PythonまたはCodex同梱のPythonを自動検出します。通常のPython環境では `python -m http.server 8000` でも起動できます。Pythonがない場合は任意の静的HTTPサーバーを使用できます。ES Modulesを使うため、HTMLのダブルクリックではなくHTTPで開きます。

GitHub Pagesでは、このフォルダのファイルをそのまま公開できます。Three.js 0.180.0をjsDelivrから読み込むためインターネット接続が必要です。スマートフォンでも公開URLからプレイできます。

## 操作

- START FLIGHTで開始。WASDまたは矢印キーで移動、Space長押しで連射。
- スマホは左下のスティックで移動、右下のFIRE長押しで連射。横画面推奨。
- P / Escape / 右上ボタンで一時停止。タブを離れると自動停止。
- HPが0になるとGAME OVER。RESTARTでスコア、敵、弾をリセット。

## 実装

HP5、被弾後1.4秒の無敵時間。直進・波状・追尾射撃の3種類の敵。撃破スコアは100 / 150 / 250。時間経過で出現間隔と移動速度が少し上がるエンドレス形式。

ローポリ宇宙船、奥行きから現れる敵、3層の星、回転する遠景構造物、床グリッド、撃破粒子をGeometry / Materialで描画。影とポストプロセスは使用しません。弾・敵・粒子は固定数のプール、GPUのGeometryとMaterialを共有します。衝突はX/Yの円形距離判定。敵の登場中0.7秒は衝突なし。

自機はIBOJITCHの3Dモデルに差し替えています。`playerModel.js`が`ibojitch_player.glb`を読み込み、読み込み完了後にゲームを起動します。テクスチャ画像は使いません。右向き・顔がカメラ側、倍率0.68。モデルの大きさは`playerModel.js`の`root.scale.setScalar()`で調整できます。自機の当たり判定半径0.48と操作・HP・射撃ルールは維持しています。旧宇宙船の噴射エフェクトは削除しました。静的ホスティング時はGLBとローダーも一緒に配置してください。

`game.js`内のGame / Player / Enemy / Bullet / Input / UIクラスで責務を分けています。表示領域は32×18のプレイ範囲を常に収め、縦画面では上下に余白を取ります。床と構造物は背景で、接触ダメージはありません。

## 拡張の入口

- Enemy：敵タイプ、ボス、弾幕。
- Player / Bullet：武器、パワーアップ、シールド。
- Game.update：ステージ進行、地形障害物、アイテム。
- UI：音量設定、ランキング、ステージ選択。

MVPは無音です。実機のスマートフォンにおける60fpsは保証していません。
