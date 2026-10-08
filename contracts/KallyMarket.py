# { "Depends": "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng" }
"""One Kally market. Scores use basis points; stakes and bond use GEN wei."""
import genlayer as gl
from genlayer import *
from genlayer.storage import TreeMap
from datetime import datetime, timezone
import json


@gl.evm.contract_interface
class _Payee:
    class View:
        pass

    class Write:
        pass


class KallyMarket(gl.contract.Contract):
    creator: Address
    model: str
    metric: str
    dataset: str
    target_bps: u32
    deadline: u256
    report_base_url: str
    checkpoint_cid: str
    report_cid: str
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

    def __init__(self, model: str, target_bps: u32, deadline: u256, report_base_url: str):
        now = int(datetime.now(timezone.utc).timestamp())
        if not model or int(target_bps) > 10000 or int(deadline) <= now:
            raise gl.vm.UserError("invalid market parameters")
        if not report_base_url.startswith("https://") or not report_base_url.endswith(("/reports/", "/ipfs/")):
            raise gl.vm.UserError("report URL must be HTTPS and end with /reports/ or /ipfs/")
        self.creator = gl.message.sender_address
        self.model = model
        self.metric = "accuracy"
        self.dataset = "kally-demo-v1"
        self.target_bps = target_bps
        self.deadline = deadline
        self.report_base_url = report_base_url

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
    def submit_checkpoint(self, checkpoint_cid: str) -> None:
        if gl.message.sender_address != self.creator or self.checkpoint_cid:
            raise gl.vm.UserError("only creator may submit one checkpoint")
        if int(datetime.now(timezone.utc).timestamp()) >= int(self.deadline):
            raise gl.vm.UserError("submission closed")
        if len(checkpoint_cid) < 40 or len(checkpoint_cid) > 100 or not checkpoint_cid.isalnum():
            raise gl.vm.UserError("invalid CID")
        self.checkpoint_cid = checkpoint_cid

    @gl.public.write
    def resolve(self, report_cid: str) -> None:
        if self.resolved or int(datetime.now(timezone.utc).timestamp()) < int(self.deadline):
            raise gl.vm.UserError("resolution unavailable")
        if not self.checkpoint_cid:
            raise gl.vm.UserError("checkpoint missing")
        if len(report_cid) < 40 or len(report_cid) > 100 or not report_cid.isalnum():
            raise gl.vm.UserError("invalid report CID")
        url = self.report_base_url + report_cid
        model = self.model
        metric = self.metric
        dataset = self.dataset
        checkpoint_cid = self.checkpoint_cid

        def fetch_score() -> int:
            response = gl.nondet.web.get(url)
            if response.status != 200:
                raise gl.vm.UserError("report unavailable")
            report = json.loads(response.body.decode("utf-8"))
            if (report.get("schema") != "kally.report.v1"
                    or report.get("model") != model
                    or report.get("metric") != metric
                    or report.get("dataset") != dataset
                    or report.get("checkpoint_cid") != checkpoint_cid):
                raise gl.vm.UserError("report does not match market")
            predictions = report.get("predictions")
            if (not isinstance(predictions, list) or len(predictions) != 10
                    or any(p not in ("positive", "negative") for p in predictions)):
                raise gl.vm.UserError("invalid predictions")
            correct = sum(
                prediction == ("positive" if index % 2 == 0 else "negative")
                for index, prediction in enumerate(predictions)
            )
            score = correct * 1000
            if report.get("score_bps") != score:
                raise gl.vm.UserError("report score does not match predictions")
            return score

        score = gl.eq_principle.strict_eq(fetch_score)
        self.score_bps = u32(score)
        self.success = score >= int(self.target_bps)
        self.report_cid = report_cid
        self.resolver = gl.message.sender_address
        self.resolved = True

    @gl.public.write
    def cancel_missing_checkpoint(self) -> None:
        if self.resolved or self.checkpoint_cid or int(datetime.now(timezone.utc).timestamp()) < int(self.deadline):
            raise gl.vm.UserError("cancellation unavailable")
        self.cancelled = True
        self.resolved = True
        self.resolver = gl.message.sender_address

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
                "checkpoint_cid": self.checkpoint_cid, "report_cid": self.report_cid,
                "score_bps": int(self.score_bps), "resolved": self.resolved,
                "cancelled": self.cancelled,
                "success": self.success, "yes_pool": int(self.yes_pool),
                "no_pool": int(self.no_pool), "bond": int(self.bond)}

    @gl.public.view
    def get_position(self, user: Address) -> dict:
        return {"yes_stake": int(self.yes_stakes.get(user, u256(0))),
                "no_stake": int(self.no_stakes.get(user, u256(0))),
                "claimed": self.claimed.get(user, False)}
