-- テスト用データベース。`pnpm check` の L2 は実 Postgres へ繋ぐので、
-- 開発用の toiito と作業データを混ぜないよう最初から分けておく。
-- （initdb スクリプトは volume が空のときだけ走る。作り直しは docker compose down -v）
create database toiito_test owner toiito;
