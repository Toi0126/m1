from __future__ import annotations

import os

import boto3


def _required_env(name: str) -> str:
    v = os.environ.get(name, "").strip()
    if not v:
        raise SystemExit(f"{name} is required")
    return v


def main() -> None:
    table_name = _required_env("DDB_TABLE_NAME")

    ddb = boto3.client("dynamodb")
    existing = ddb.list_tables().get("TableNames", [])
    if table_name in existing:
        print(f"Table already exists: {table_name}")
        return

    ddb.create_table(
        TableName=table_name,
        AttributeDefinitions=[
            {"AttributeName": "pk", "AttributeType": "S"},
            {"AttributeName": "sk", "AttributeType": "S"},
        ],
        KeySchema=[
            {"AttributeName": "pk", "KeyType": "HASH"},
            {"AttributeName": "sk", "KeyType": "RANGE"},
        ],
        BillingMode="PAY_PER_REQUEST",
    )

    ddb.get_waiter("table_exists").wait(TableName=table_name)
    print(f"Created table: {table_name}")


if __name__ == "__main__":
    main()
