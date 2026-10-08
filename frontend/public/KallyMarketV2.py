# { "Depends": "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng" }
"""Kally V2: validators execute a bounded linear classifier benchmark."""
import genlayer as gl
from genlayer import *
from genlayer.storage import TreeMap
from datetime import datetime, timezone
import json
import hashlib


@gl.evm.contract_interface
class _Payee:
    class View:
        pass

    class Write:
        pass


class KallyMarketV2(gl.contract.Contract):
    creator: Address
    model: str
    metric: str
    dataset: str
    target_bps: u32
    deadline: u256
    report_base_url: str
    checkpoint_cid: str
    checkpoint_sha256: str
    dataset_cid: str
    dataset_sha256: str
    score_bps: u32
    resolved: bool
    cancelled: bool
    success: bool
    resolver: Address
    bond: u256
    yes_pool: u256
    no_pool: u256
    yes_stakes: TreeMap[Address, u256]
    no_stakes: TreeMap[Address, u256]
    claimed: TreeMap[Address, bool]
    bond_claimed: bool
    paid_winners: u256
    winner_stake_claimed: u256

    def __init__(self, model: str, target_bps: u32, deadline: u256, report_base_url: str,
                 checkpoint_cid: str, checkpoint_sha256: str, dataset_sha256: str):
        now = int(datetime.now(timezone.utc).timestamp())
        if not model or len(model) > 100 or int(target_bps) > 10000 or int(deadline) <= now:
            raise gl.vm.UserError("invalid market parameters")
        if (len(report_base_url) > 200 or not report_base_url.startswith("https://")
                or not report_base_url.endswith("/ipfs/") or "?" in report_base_url or "#" in report_base_url):
            raise gl.vm.UserError("gateway must be an HTTPS /ipfs/ URL")
        if len(checkpoint_cid) < 40 or len(checkpoint_cid) > 100 or not checkpoint_cid.isalnum():
            raise gl.vm.UserError("invalid CID")
        for digest in (checkpoint_sha256, dataset_sha256):
            if len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest):
                raise gl.vm.UserError("invalid SHA-256 digest")
        self.creator = gl.message.sender_address
        self.model = model
        self.metric = "accuracy"
        self.dataset = "kally.linear.v1"
        self.target_bps = target_bps
        self.deadline = deadline
        self.report_base_url = report_base_url
        self.checkpoint_cid = checkpoint_cid
        self.checkpoint_sha256 = checkpoint_sha256
        self.dataset_sha256 = dataset_sha256

    @gl.public.write.payable
    def fund_bond(self) -> None:
        if gl.message.sender_address != self.creator or self.resolved:
            raise gl.vm.UserError("only creator can fund before resolution")
        if int(gl.message.value) == 0:
            raise gl.vm.UserError("send GEN")
        self.bond += gl.message.value

    @gl.public.write.payable
    def place_bet(self, predicts_success: bool) -> None:
        if self.resolved or int(datetime.now(timezone.utc).timestamp()) >= int(self.deadline):
            raise gl.vm.UserError("betting closed")
        if int(self.bond) == 0 or int(gl.message.value) == 0:
            raise gl.vm.UserError("bond and stake required")
        sender = gl.message.sender_address
        if predicts_success:
            self.yes_stakes[sender] = self.yes_stakes.get(sender, u256(0)) + gl.message.value
            self.yes_pool += gl.message.value
        else:
            self.no_stakes[sender] = self.no_stakes.get(sender, u256(0)) + gl.message.value
            self.no_pool += gl.message.value

    @gl.public.write
    def resolve(self, dataset_cid: str) -> None:
        if self.resolved or int(datetime.now(timezone.utc).timestamp()) < int(self.deadline):
            raise gl.vm.UserError("resolution unavailable")
        if len(dataset_cid) < 40 or len(dataset_cid) > 100 or not dataset_cid.isalnum():
            raise gl.vm.UserError("invalid dataset CID")
        model_url = self.report_base_url + self.checkpoint_cid
        dataset_url = self.report_base_url + dataset_cid
        model_hash = self.checkpoint_sha256
        dataset_hash = self.dataset_sha256

        def fetch_score() -> int:
            model_response = gl.nondet.web.get(model_url)
            dataset_response = gl.nondet.web.get(dataset_url)
            if model_response.status_code != 200 or dataset_response.status_code != 200:
                raise gl.vm.UserError("benchmark artifact unavailable")
            model_bytes = model_response.body
            dataset_bytes = dataset_response.body
            if not model_bytes or not dataset_bytes or len(model_bytes) > 65536 or len(dataset_bytes) > 65536:
                raise gl.vm.UserError("benchmark artifact size invalid")
            if hashlib.sha256(model_bytes).hexdigest() != model_hash or hashlib.sha256(dataset_bytes).hexdigest() != dataset_hash:
                raise gl.vm.UserError("benchmark artifact hash mismatch")
            try:
                model_data = json.loads(model_bytes.decode("utf-8"))
                dataset_data = json.loads(dataset_bytes.decode("utf-8"))
            except Exception:
                raise gl.vm.UserError("benchmark artifacts must be JSON")
            if not isinstance(model_data, dict) or set(model_data) != {"schema", "weights", "bias"} or model_data["schema"] != "kally.linear.v1":
                raise gl.vm.UserError("invalid model schema")
            weights = model_data["weights"]
            bias = model_data["bias"]
            if (not isinstance(weights, list) or not 1 <= len(weights) <= 16
                    or any(type(w) is not int or abs(w) > 1000000 for w in weights)
                    or type(bias) is not int or abs(bias) > 1000000):
                raise gl.vm.UserError("invalid model values")
            if not isinstance(dataset_data, dict) or set(dataset_data) != {"schema", "examples", "nonce"} or dataset_data["schema"] != "kally.dataset.v1":
                raise gl.vm.UserError("invalid dataset schema")
            nonce = dataset_data["nonce"]
            if not isinstance(nonce, str) or len(nonce) != 64 or any(c not in "0123456789abcdef" for c in nonce):
                raise gl.vm.UserError("invalid dataset nonce")
            examples = dataset_data["examples"]
            if not isinstance(examples, list) or not 1 <= len(examples) <= 32:
                raise gl.vm.UserError("invalid dataset length")
            correct = 0
            for example in examples:
                if not isinstance(example, dict) or set(example) != {"features", "label"}:
                    raise gl.vm.UserError("invalid example")
                features = example["features"]
                label = example["label"]
                if (not isinstance(features, list) or len(features) != len(weights)
                        or any(type(v) is not int or abs(v) > 1000000 for v in features)
                        or type(label) is not int or label not in (0, 1)):
                    raise gl.vm.UserError("invalid example values")
                predicted = int(bias + sum(w * v for w, v in zip(weights, features)) >= 0)
                correct += int(predicted == label)
            return correct * 10000 // len(examples)

        score = gl.eq_principle.strict_eq(fetch_score)
        self.score_bps = u32(score)
        self.success = score >= int(self.target_bps)
        self.dataset_cid = dataset_cid
        self.resolver = gl.message.sender_address
        self.resolved = True

    @gl.public.write
    def cancel_unresolved(self) -> None:
        if self.resolved or int(datetime.now(timezone.utc).timestamp()) < int(self.deadline) + 604800:
            raise gl.vm.UserError("cancellation unavailable")
        self.cancelled = True
        self.resolved = True
        self.resolver = gl.message.sender_address

    @gl.public.write
    def claim(self) -> None:
        if not self.resolved:
            raise gl.vm.UserError("market unresolved")
        sender = gl.message.sender_address
        if self.claimed.get(sender, False):
            raise gl.vm.UserError("already claimed")
        winner_pool = u256(0) if self.cancelled else (self.yes_pool if self.success else self.no_pool)
        loser_pool = self.no_pool if self.success else self.yes_pool
        stake = (self.yes_stakes if self.success else self.no_stakes).get(sender, u256(0))
        if int(winner_pool) == 0:
            stake = self.yes_stakes.get(sender, u256(0)) + self.no_stakes.get(sender, u256(0))
            payout = stake
        elif int(stake) > 0:
            payout = stake + loser_pool * stake // winner_pool
            self.winner_stake_claimed += stake
            if self.winner_stake_claimed == winner_pool:
                payout = self.yes_pool + self.no_pool - self.paid_winners
            self.paid_winners += payout
        else:
            payout = u256(0)
        if int(payout) == 0:
            raise gl.vm.UserError("nothing to claim")
        self.claimed[sender] = True
        _Payee(sender).emit_transfer(value=payout)

    @gl.public.write
    def claim_bond(self) -> None:
        if not self.resolved or self.bond_claimed or int(self.bond) == 0:
            raise gl.vm.UserError("bond unavailable")
        recipient = self.creator if self.success and not self.cancelled else self.resolver
        self.bond_claimed = True
        _Payee(recipient).emit_transfer(value=self.bond)

    @gl.public.view
    def get_market(self) -> dict:
        return {"model": self.model, "metric": self.metric, "dataset": self.dataset,
                "target_bps": int(self.target_bps), "deadline": int(self.deadline),
                "version": 2,
                "checkpoint_cid": self.checkpoint_cid, "checkpoint_sha256": self.checkpoint_sha256,
                "dataset_cid": self.dataset_cid, "dataset_sha256": self.dataset_sha256,
                "gateway": self.report_base_url,
                "report_cid": "", "bond_claimed": self.bond_claimed,
                "score_bps": int(self.score_bps), "resolved": self.resolved,
                "cancelled": self.cancelled,
                "success": self.success, "yes_pool": int(self.yes_pool),
                "no_pool": int(self.no_pool), "bond": int(self.bond)}

    @gl.public.view
    def get_position(self, user: Address) -> dict:
        return {"yes_stake": int(self.yes_stakes.get(user, u256(0))),
                "no_stake": int(self.no_stakes.get(user, u256(0))),
                "claimed": self.claimed.get(user, False)}
