import { DEFAULT_CATEGORIES, DEFAULT_LANDMARKS, GROUPS } from './config';
import { ArrowLeft, CircleDot, ShieldCheck } from 'lucide-react';
const sections = [
  ['start', 'はじめに'],
  ['images', '画像・個体情報'],
  ['papillae', 'Papillaeの計数'],
  ['landmarks', 'Landmarkの記録'],
  ['edit', '表示・点の修正'],
  ['save', '保存と書き出し'],
  ['share', '共同研究者との共有'],
  ['legacy', '以前のデータ'],
  ['faq', 'よくある質問'],
  ['mobile', 'スマホで使う'],
];
export function HelpPage() {
  return (
    <div className="guide-page">
      <header className="guide-header">
        <a href="./" className="guide-brand">
          <CircleDot size={25} />
          <span>Papillae Annotator</span>
        </a>
        <a className="help-link" href="./">
          <ArrowLeft size={16} />
          アプリを開く
        </a>
      </header>
      <div className="guide-intro">
        <span className="eyebrow">USER GUIDE</span>
        <h1>使い方</h1>
        <p>公開URLを開いて、画像の読み込みから記録・保存・共同研究者とのデータ交換まで。</p>
        <div className="guide-local">
          <ShieldCheck size={16} />
          画像と記録は各自のブラウザ内に保存されます。公開URLを使っても自動送信・共有はされません。
        </div>
      </div>
      <div className="guide-layout">
        <nav aria-label="使い方の目次">
          {sections.map(([id, label], i) => (
            <a key={id} href={`#${id}`}>
              <span>{String(i + 1).padStart(2, '0')}</span>
              {label}
            </a>
          ))}
        </nav>
        <main className="guide-content">
          <section id="start">
            <h2>1. はじめに</h2>
            <p>
              共同研究者から受け取ったアプリのURLをブラウザで開きます。利用するだけならGitHubアカウントやソフトのインストールは不要です。スマホでは画面幅に合わせた操作画面に自動で切り替わります。
            </p>
            <p>
              <a href="#mobile">スマホの操作方法はこちら</a>
              。パソコンでの精密作業にはChromeまたはEdgeと広めの画面をおすすめします。
            </p>
            <ol>
              <li>画像を読み込みます。</li>
              <li>個体ID・side・計数者を入力します。</li>
              <li>PapillaeとLandmarkを記録します。</li>
              <li>JSONまたは完全バックアップZIPを保存します。</li>
            </ol>
            <p className="guide-callout">
              ブラウザ内の自動保存だけに頼らず、作業の区切りごとにバックアップを保存してください。初めて使う場合は、アプリ中央の「検証用サンプルで試す」で操作を確認できます。サンプルは合成画像です。
            </p>
          </section>
          <section id="images">
            <h2>2. 画像・個体情報</h2>
            <p>
              「画像を読み込む」または左欄の＋でJPG・PNG・TIFFを選びます。画像ファイルをアプリへドラッグ＆ドロップすることもできます。複数画像を登録し、左の一覧で切り替えます。TIFFは対応形式の先頭ページを表示します。
            </p>
            <p>
              個体ID、side（L／R）、計数者observerを入力します。同じ個体の左右は画像ごとにsideを指定してください。種名・採集地・SL・HL・ピクセルサイズ・備考は任意です。sexはM・F・未入力から選べます。必須情報が未入力でも下書きは保存されますが、解析前に補完してください。
            </p>
            <p>
              同じ画像を別の人が計数する場合は、左欄「ANNOTATION
              SESSION」の＋で新規セッションを作り、その人のobserverを入力します。
            </p>
          </section>
          <section id="papillae">
            <h2>3. Papillaeの計数（32項目）</h2>
            <p>
              右欄のPapillaeモードでカテゴリを選び、画像上をクリックします。1クリックで1個。同じカテゴリへ続けて入力できます。「1〜6」はそれぞれ独立したカテゴリです。
            </p>
            <div className="guide-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>グループ</th>
                    <th>カテゴリ</th>
                  </tr>
                </thead>
                <tbody>
                  {GROUPS.map((group) => (
                    <tr key={group}>
                      <th>{group}</th>
                      <td>
                        {DEFAULT_CATEGORIES.filter((c) => c.group === group).map((c) => (
                          <span className="guide-category" key={c.id}>
                            <i style={{ background: c.color }} />
                            {c.id}
                            <kbd>{c.shortcut}</kbd>
                          </span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              ボタン右上のキーでもカテゴリを切り替えられます。入力欄を編集しているときは文字入力を優先します。計数が終わったら、そのカテゴリの「計数完了」を押してください。
            </p>
            <table>
              <thead>
                <tr>
                  <th>観察状態</th>
                  <th>意味と出力</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th>未観察</th>
                  <td>まだ観察していない状態。NA。</td>
                </tr>
                <tr>
                  <th>計数中</th>
                  <td>途中の値。ボタンに*を付けて表示し、暫定値として出力。</td>
                </tr>
                <tr>
                  <th>計数完了</th>
                  <td>確定値。観察して0個だった場合も「計数完了」を指定。</td>
                </tr>
                <tr>
                  <th>観察不可</th>
                  <td>写っていない・判別できない状態。NA。</td>
                </tr>
              </tbody>
            </table>
            <p>
              a_totalはa1〜a6、c_totalはc1〜c10、papillae_totalは全32カテゴリが対象です。対象がすべて完了するまで完全合計はNAです。完了したカテゴリの確定小計と計数中の暫定値を別に表示・出力します。点があるカテゴリを未観察・観察不可に変更することはできません。
            </p>
            <p>
              複数項目をまとめて確定するには、Papillaeの「まとめて計数完了」を開き、対象のチェックを付けます。グループ単位、「計数中だけ選択」、「未完了をすべて選択」も利用できます。選択した項目と個数を確認し、「選択した○項目を計数完了」を押してください。未観察の項目は0個で確定するため、実際に観察した項目だけを選びます。観察不可と完了済みは対象外です。現在の画像・セッションだけに適用され、一括変更は「元に戻す」1回で取り消せます。スマホでは下のカテゴリ名から一覧パネルを開きます。
            </p>
          </section>
          <section id="landmarks">
            <h2>4. Landmarkの記録（13項目）</h2>
            <p>
              Landmarkモードに切り替えて項目を選び、画像上をクリックします。各項目につき1点です。Papillaeの計数値には含みません。
            </p>
            <ol className="guide-landmarks">
              {DEFAULT_LANDMARKS.map((l) => (
                <li key={l.id}>{l.label}</li>
              ))}
            </ol>
            <p>
              「自動で次へ」がONなら、記録後に次の未記録項目へ進みます。記録済み・観察不可・今回スキップした項目は飛ばします。OFFなら同じ選択を維持します。途中で任意の項目へ戻れます。
            </p>
            <p>
              写っていない項目は「観察不可」、いったん後回しにする項目は「スキップ」を選びます。全点を埋める必要はありません。記録済みの項目を再クリックした場合は編集モードになるため、既存点を移動して修正してください。
            </p>
          </section>
          <section id="edit">
            <h2>5. 表示・点の修正</h2>
            <p>
              ホイールで拡大・縮小、Spaceを押しながらドラッグでパン。「全体表示」で画像を画面に合わせます。ROIを押して画像上をドラッグすると、その領域を拡大表示します。隣のリセットアイコンでROIを解除できます。
            </p>
            <p>
              編集モードで点を選び、ドラッグまたはXY欄で移動します。Papillaeはカテゴリを変更でき、選択点はDeleteで削除できます。孔器を修正したカテゴリは計数中に戻るため、確認後に再度「計数完了」を押してください。
            </p>
            <p>
              明度・コントラスト・ガンマ・チャンネルは表示だけを調整します。元画像と記録座標は変わりません。座標は画像左上が原点で、右方向がX、下方向がY、単位は元画像のpxです。
            </p>
            <table>
              <thead>
                <tr>
                  <th>キー</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Ctrl+Z</td>
                  <td>元に戻す</td>
                </tr>
                <tr>
                  <td>Ctrl+Y／Ctrl+Shift+Z</td>
                  <td>やり直す</td>
                </tr>
                <tr>
                  <td>Space＋ドラッグ</td>
                  <td>画像のパン</td>
                </tr>
                <tr>
                  <td>Delete</td>
                  <td>編集モードの選択点を削除</td>
                </tr>
                <tr>
                  <td>Esc</td>
                  <td>選択を解除</td>
                </tr>
              </tbody>
            </table>
          </section>
          <section id="save">
            <h2>6. 保存と書き出し</h2>
            <p>
              入力後は自動保存されます。終了前に上部の「ローカル保存済み」を確認してください。右上の「書き出す」から、用途に応じて保存できます。
            </p>
            <table>
              <thead>
                <tr>
                  <th>形式</th>
                  <th>用途</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th>プロジェクトJSON</th>
                  <td>
                    画像・全点・観察状態・個体情報・全セッションを保存。再開やデータ交換に使用。
                  </td>
                </tr>
                <tr>
                  <th>完全バックアップZIP</th>
                  <td>JSON、元画像、CSVをまとめて保存。</td>
                </tr>
                <tr>
                  <th>CSV 5種ZIP</th>
                  <td>
                    計数、孔器座標、カテゴリ状態、Landmark、個体情報を解析用に保存。旧Landmarkがある場合は保全用CSVも追加。
                  </td>
                </tr>
                <tr>
                  <th>注釈つきPNG 2種ZIP</th>
                  <td>
                    Papillaeのみ／Papillae＋Landmarkの2枚。個別保存も可能。孔器はカテゴリ別の色、Landmarkは共通の黄色。
                  </td>
                </tr>
              </tbody>
            </table>
            <p>
              注釈画像には画面の一時的な非表示設定にかかわらず全記録を出力します。表示調整・点の透明度を反映し、ROIに関係なく元画像全体を元サイズで出力します。点サイズは出力時のズームに対応します。
            </p>
            <p>
              再開時は「データ読込」でJSONまたは完全バックアップZIPを選んでください。CSVは画像を含まないため、通常の再開にはJSON／ZIPを使用します。LandmarkのCSVには共通ID（landmark）と日本語名（landmark_label）を両方出力します。
            </p>
          </section>
          <section id="share">
            <h2>7. 共同研究者との共有</h2>
            <p>
              同じURLを開いても、他の人の記録は自動で表示されません。記録の交換は、研究チームで決めたファイル共有方法で行ってください。
            </p>
            <ol>
              <li>担当者が画像・個体ID・sideを登録し、カテゴリ設定を統一します。</li>
              <li>JSONまたは完全バックアップZIPを共同研究者へ渡します。</li>
              <li>共同研究者は同じアプリURLの「データ読込」で読み込みます。</li>
              <li>新しいセッションを作り、自分のobserverを入力して計数します。</li>
              <li>終了後にJSON／ZIPを返します。担当者が「データ読込」で追加統合します。</li>
            </ol>
            <p>
              同じセッションIDで内容が異なるデータは、別セッションとして両方を保持します。カテゴリ設定が異なるデータは、そのまま統合できません。設定を独自に変更する場合は、記録開始前にチーム内で合意してください。
            </p>
          </section>
          <section id="legacy">
            <h2>8. 以前のデータを使う場合</h2>
            <p>
              旧標準の22カテゴリ・9Landmarkのプロジェクトは、新しい項目へ移行します。既存の孔器点・観察状態・共通Landmarkの座標を保ち、新設項目は未観察／未記録になります。
            </p>
            <p>
              新しい一覧から外れたPN・吻前端・吻後端は、別の部位へ自動的に置き換えません。「以前のLandmark（保全）」で確認でき、JSONとretired_landmarks.csvに保存します。現在の13項目の入力や注釈画像には含めません。第一背鰭前端は再追加され、保全されていた記録があれば元の座標・点ID・状態を復元します。記録がない場合は未記録で追加します。
            </p>
            <p>
              ブラウザ内の旧データは移行前のコピーも自動保全します。念のため更新前後にJSON／ZIPを保存してください。独自のカテゴリ定義は自動変更しません。旧CSVだけを持っている場合は、対応する旧JSON／ZIPを先に復元してください。
            </p>
          </section>
          <section id="faq">
            <h2>9. よくある質問</h2>
            <details open>
              <summary>URLで開くと、研究画像が公開されますか？</summary>
              <p>
                このアプリは読み込んだ画像や記録をサーバーへ送信しません。各自のブラウザに保存します。GitHubのリポジトリへ研究ファイルを直接追加する行為は別なので、研究画像・JSON・バックアップを公開リポジトリへ登録しないでください。
              </p>
            </details>
            <details>
              <summary>別のパソコン・ローカル版から記録を移すには？</summary>
              <p>
                元の環境でJSON／完全バックアップZIPを書き出し、新しい環境の「データ読込」で読み込みます。端末・ブラウザ・保存先が変わると、自動保存は自動で移りません。
              </p>
            </details>
            <details>
              <summary>「別タブが編集中」と表示される</summary>
              <p>
                同じ保存領域への上書きを防ぐため、編集は1タブに制限しています。他のアプリタブを閉じ、この画面を再読み込みしてください。この使い方ページは編集ロックを取得しないので、開いたままで使えます。
              </p>
            </details>
            <details>
              <summary>ブラウザのデータを消したらどうなりますか？</summary>
              <p>
                自動保存の記録が失われる場合があります。JSON／ZIPを別の場所にも保管してください。プライベートモードでは終了時に消えることがあるため、通常のウィンドウでの利用をおすすめします。
              </p>
            </details>
          </section>
          <section id="mobile">
            <h2>10. スマホで使う</h2>
            <p>
              パソコン版と同じURLで使えます。縦向き・横向きの両方に対応します。下の「画像」から画像一覧・個体情報・観察セッションを開きます。画像を読み込んだら個体ID、side、計数者を入力し、パネルを閉じてください。対応画像はJPG・PNG・TIFFです。HEICは事前にJPGまたはPNGへ変換してください。
            </p>
            <ol>
              <li>下のPapillae／Landmarkを選び、カテゴリ名をタップして項目を選びます。</li>
              <li>
                画像を1本指で動かし、2本指で拡大・縮小します。画面中央の小さな十字を記録したい場所へ合わせます。
              </li>
              <li>
                「十字位置に追加」で1点記録します。画像を動かしただけでは点は追加されません。「直接タップ」に切り替えると画像へのタップで記録できます。
              </li>
              <li>
                Papillaeの観察後は「計数完了」を押します。0個も完了指定が必要です。Landmarkは「自動で次へ」がONなら次の項目へ進みます。
              </li>
            </ol>
            <p>
              修正するときは「編集」を選び、点の近くをタップします。画像を動かして移動先を十字に合わせ、「十字へ移動」を押します。点の編集パネルではXY入力、1pxずつの矢印、カテゴリ変更、削除ができます。下の矢印で元に戻す／やり直す操作ができます。明度などの画像調整は「画像」、点の表示設定はカテゴリ一覧パネルから開けます。
            </p>
            <p>
              右上の「書き出す」からJSON／ZIP／CSV／注釈画像を保存します。スマホとパソコンの間はJSONまたは完全バックアップZIPで受け渡します。同じURLでも端末間の自動同期はありません。保存ファイルがダウンロード先にあることを確認してください。
            </p>
            <p className="guide-callout">
              アプリを切り替える際も保存を試みますが、OSがブラウザを終了すると保存が間に合わない場合があります。「ローカル保存済み」を確認し、作業の区切りごとにJSON／ZIPを別途保存してください。大きな画像はメモリを消費するため、スマホでは少数の画像に分けた作業をおすすめします。iPhone／Android実機での操作・保存画面は未検証です。
            </p>
          </section>
        </main>
      </div>
      <footer className="guide-footer">
        <span>更新：2026-11-17</span>
        <a href="./">アプリを開く →</a>
      </footer>
    </div>
  );
}
