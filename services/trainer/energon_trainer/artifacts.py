"""Adapter storage: tar.gz in S3-compatible object storage (Cloudflare R2)."""

from __future__ import annotations

import hashlib
import os
import shutil
import tarfile
import tempfile
from dataclasses import dataclass
from pathlib import Path


@dataclass
class StoredArtifact:
    uri: str
    sha256: str
    bytes: int

    def as_dict(self) -> dict:
        return {"uri": self.uri, "sha256": self.sha256, "bytes": self.bytes}


def pack(directory: Path, destination: Path) -> Path:
    with tarfile.open(destination, "w:gz") as archive:
        archive.add(directory, arcname="adapter")
    return destination


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def unpack(archive_path: Path, destination: Path) -> Path:
    with tarfile.open(archive_path, "r:gz") as archive:
        archive.extractall(destination, filter="data")
    return destination / "adapter"


class S3ArtifactStore:
    """Uses the same ENERGON_ARTIFACTS_* variables as the API."""

    def __init__(self) -> None:
        import boto3

        self.bucket = os.environ["ENERGON_ARTIFACTS_BUCKET"]
        self.client = boto3.client(
            "s3",
            endpoint_url=os.environ["ENERGON_ARTIFACTS_ENDPOINT"],
            region_name=os.environ.get("ENERGON_ARTIFACTS_REGION", "auto"),
            aws_access_key_id=os.environ["ENERGON_ARTIFACTS_ACCESS_KEY_ID"],
            aws_secret_access_key=os.environ["ENERGON_ARTIFACTS_SECRET_ACCESS_KEY"],
        )

    def upload(self, directory: Path, key: str) -> StoredArtifact:
        with tempfile.TemporaryDirectory() as tmp:
            archive = pack(directory, Path(tmp) / "adapter.tar.gz")
            self.client.upload_file(str(archive), self.bucket, key)
            return StoredArtifact(f"s3://{self.bucket}/{key}", sha256_file(archive), archive.stat().st_size)

    def download(self, uri: str, destination: Path, expected_sha256: str) -> Path:
        bucket, key = uri.removeprefix("s3://").split("/", 1)
        archive = destination / "previous.tar.gz"
        self.client.download_file(bucket, key, str(archive))
        if sha256_file(archive) != expected_sha256:
            raise ValueError(f"adapter checksum mismatch for {uri}")
        return unpack(archive, destination)


class LocalArtifactStore:
    """Writes adapters to a local directory; URIs look like s3://local/<key>."""

    def __init__(self, root: Path) -> None:
        self.root = root

    def upload(self, directory: Path, key: str) -> StoredArtifact:
        target = self.root / key
        target.parent.mkdir(parents=True, exist_ok=True)
        pack(directory, target)
        return StoredArtifact(f"s3://local/{key}", sha256_file(target), target.stat().st_size)

    def download(self, uri: str, destination: Path, expected_sha256: str) -> Path:
        source = self.root / uri.removeprefix("s3://local/")
        archive = destination / "previous.tar.gz"
        shutil.copyfile(source, archive)
        if sha256_file(archive) != expected_sha256:
            raise ValueError(f"adapter checksum mismatch for {uri}")
        return unpack(archive, destination)
