#!/usr/bin/env python3
"""Regenerate the founder-page (/mene) assets from the canonical headshot.

Outputs, all committed because GitHub Pages serves public/ verbatim:
  public/mene.vcf                               vCard 3.0, CRLF, 75-octet folding, embedded 256px JPEG
  public/images/team/mene-headshot-v1-320.webp  avatar for the identity card (88/112px circles, 2-3x)
  public/images/qr/mene-c-qr.svg                desktop "scan to save to your phone" QR -> /c/mene

Run:  python3 scripts/build-founder-assets.py        (pip install pillow segno)

vCard notes
- Only the PHOTO property is regenerated; every other property is carried over from the committed
  file, so edits to name/org/links are made in public/mene.vcf directly.
- TEL is the public toll-free main line (confirmed 2026-09-29); it is edited directly in
  public/mene.vcf and mirrored by SMS_NUMBER in src/components/mene/FounderPage.astro.
- GitHub Pages cannot set Content-Disposition; the .vcf is served inline as text/x-vcard on
  purpose (iOS Safari then offers "Add to Contacts" directly instead of saving to Files).
"""
import base64
import io
import pathlib
import sys

from PIL import Image
import segno

ROOT = pathlib.Path(__file__).resolve().parents[1]
HEADSHOT = ROOT / "public/images/team/mene-headshot-v1.webp"
VCF = ROOT / "public/mene.vcf"
AVATAR = ROOT / "public/images/team/mene-headshot-v1-320.webp"
QR = ROOT / "public/images/qr/mene-c-qr.svg"
# Spec'd as metriasmedical.com/c/mene?utm_source=qr; the www host is used because the bare apex
# 301-redirects (README, Brand Assets).
QR_URL = "https://www.metriasmedical.com/c/mene?utm_source=qr"


def fold(line: str, width: int = 75) -> list[str]:
    """RFC 2425 folding on octet count (all content here is ASCII, so chars == octets)."""
    out, first = [], True
    while line:
        if first:
            out.append(line[:width]); line = line[width:]; first = False
        else:
            out.append(" " + line[: width - 1]); line = line[width - 1 :]
    return out


def build_vcard() -> None:
    im = Image.open(HEADSHOT).convert("RGB").resize((256, 256), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, format="JPEG", quality=85, optimize=True)
    jpeg = buf.getvalue()
    assert len(jpeg) < 50_000, f"photo too large: {len(jpeg)} bytes"
    b64 = base64.b64encode(jpeg).decode("ascii")

    raw = VCF.read_bytes().decode("utf-8")
    assert "\r\n" in raw, "expected a CRLF vCard"
    logical: list[str] = []
    for ln in raw.split("\r\n"):
        if ln.startswith(" ") and logical:
            logical[-1] += ln[1:]
        else:
            logical.append(ln)
    replaced = False
    for i, ln in enumerate(logical):
        if ln.startswith("PHOTO;"):
            logical[i] = "PHOTO;ENCODING=b;TYPE=JPEG:" + b64
            replaced = True
    assert replaced, "no PHOTO property found"
    physical: list[str] = []
    for ln in logical:
        physical.extend(fold(ln) if len(ln) > 75 else [ln])
    data = "\r\n".join(physical).encode("utf-8")
    assert len(data) < 75_000, f"vCard too large: {len(data)} bytes"
    VCF.write_bytes(data)
    print(f"vcf: {len(data)} bytes, photo {len(jpeg)} bytes JPEG 256x256, {len(physical)} lines")


def build_avatar() -> None:
    im = Image.open(HEADSHOT).convert("RGB").resize((320, 320), Image.LANCZOS)
    im.save(AVATAR, format="WEBP", quality=82, method=6)
    print(f"avatar: {AVATAR.stat().st_size} bytes 320x320 webp")


def build_qr() -> None:
    QR.parent.mkdir(parents=True, exist_ok=True)
    qr = segno.make(QR_URL, error="m")
    qr.save(str(QR), kind="svg", omitsize=True, xmldecl=False, svgns=True, scale=4, border=2,
            dark="#1D2C66", light=None)
    print(f"qr: {QR.stat().st_size} bytes -> {QR_URL} ({qr.designator})")


if __name__ == "__main__":
    build_vcard(); build_avatar(); build_qr()
