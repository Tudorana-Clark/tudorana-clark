"""Domain errors, mapped to HTTP problems in main.py."""


class DomainError(Exception):
    status = 400
    title = "Bad request"

    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.detail = detail


class NotFound(DomainError):
    status = 404
    title = "Not found"


class Conflict(DomainError):
    status = 409
    title = "Conflict"


class UpstreamUnavailable(DomainError):
    status = 503
    title = "Service unavailable"


class RateLimited(DomainError):
    status = 429
    title = "Too many requests"
