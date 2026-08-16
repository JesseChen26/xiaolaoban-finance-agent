PENDING_EXECUTION_STATUS = "未记录"
RECORDED_EXECUTION_STATUSES = {"已执行", "部分执行", "未执行", "延后"}
VALID_EXECUTION_STATUSES = {PENDING_EXECUTION_STATUS, *RECORDED_EXECUTION_STATUSES}

DEFAULT_EXECUTION_ACTION = "观察"
VALID_EXECUTION_ACTIONS = {"观察", "买入", "卖出", "赎回", "空仓", "暂停"}


def normalize_execution_status(value):
    text = str(value or "").strip()
    return text if text in VALID_EXECUTION_STATUSES else PENDING_EXECUTION_STATUS


def normalize_execution_action(value):
    text = str(value or "").strip()
    return text if text in VALID_EXECUTION_ACTIONS else DEFAULT_EXECUTION_ACTION


def is_recorded_execution_status(value):
    return normalize_execution_status(value) in RECORDED_EXECUTION_STATUSES


def signal_execution_status(signal):
    return normalize_execution_status((signal.get("execution") or {}).get("status"))


def signal_execution_recorded(signal):
    return is_recorded_execution_status((signal.get("execution") or {}).get("status"))
