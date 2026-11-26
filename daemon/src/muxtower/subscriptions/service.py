"""The hub's book of plans: the newest report of each (provider, account), and which machines use it."""

from muxtower.subscriptions.models import PlanAccount


class PlanBook:
    def accounts(self) -> list[PlanAccount]:
        return []  # filled by the reports (step 2)
