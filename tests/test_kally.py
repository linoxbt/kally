import time
import json
from datetime import datetime, timezone

from benchmark.scoring import FIXTURE, score_predictions


def test_demo_score():
    assert score_predictions(FIXTURE["labels"]) == 10000
    assert score_predictions(["negative"] * 10) == 5000


def test_deploy_and_market(direct_deploy):
    contract = direct_deploy("contracts/KallyMarket.py", "DemoModel", 7800, int(time.time()) + 3600, "https://example.com/reports/")
    market = contract.get_market()
    assert market["model"] == "DemoModel"
    assert market["target_bps"] == 7800


def test_bets_resolution_and_claims(direct_vm, direct_deploy, direct_alice, direct_bob, direct_owner):
    deadline = int(time.time()) + 3600
    contract = direct_deploy("contracts/KallyMarket.py", "DemoModel", 7800, deadline, "https://example.com/reports/")
    checkpoint = "Qm" + "a" * 44
    report_cid = "Qm" + "b" * 44
    direct_vm.value = 100
    contract.fund_bond()
    direct_vm.sender = direct_alice
    direct_vm.value = 30
    contract.place_bet(True)
    direct_vm.sender = direct_bob
    direct_vm.value = 70
    contract.place_bet(False)
    direct_vm.sender = direct_owner
    direct_vm.value = 0
    contract.submit_checkpoint(checkpoint)
    direct_vm.warp(datetime.fromtimestamp(deadline + 1, timezone.utc).isoformat())
    direct_vm.mock_web(r"example\.com/reports/.*", {"status": 200, "body": json.dumps({
        "schema": "kally.report.v1", "model": "DemoModel", "metric": "accuracy",
        "dataset": "kally-demo-v1", "checkpoint_cid": checkpoint, "score_bps": 9000,
        "predictions": ["positive", "negative"] * 4 + ["positive", "positive"],
    })})
    contract.resolve(report_cid)
    assert contract.get_market()["success"] is True
    direct_vm.sender = direct_alice
    contract.claim()
    direct_vm.sender = direct_owner
    contract.claim_bond()


def test_missing_checkpoint_refunds_stakes(direct_vm, direct_deploy, direct_alice):
    deadline = int(time.time()) + 3600
    contract = direct_deploy("contracts/KallyMarket.py", "DemoModel", 7800, deadline, "https://example.com/reports/")
    direct_vm.value = 100
    contract.fund_bond()
    direct_vm.sender = direct_alice
    direct_vm.value = 25
    contract.place_bet(True)
    direct_vm.value = 0
    direct_vm.warp(datetime.fromtimestamp(deadline + 1, timezone.utc).isoformat())
    contract.cancel_missing_checkpoint()
    contract.claim()
    contract.claim_bond()
    assert contract.get_market()["cancelled"] is True
