"""Tests for gamegobler.rom_parser — No-Intro filename parsing."""

import pytest

from gamegobler.rom_parser import RomMeta, parse_rom_filename


# ── Basic title + region ────────────────────────────────────────────────────


class TestBasicParsing:
    def test_simple_usa(self):
        m = parse_rom_filename("Super Mario Bros. (USA).nes")
        assert m.title == "Super Mario Bros."
        assert m.regions == ["USA"]
        assert m.extension == ".nes"

    def test_multi_region(self):
        m = parse_rom_filename("Tetris (USA, Europe).gb")
        assert m.regions == ["USA", "Europe"]
        assert m.extension == ".gb"

    def test_world_region(self):
        m = parse_rom_filename("Pokemon Red (World).gbc")
        assert m.regions == ["World"]

    def test_no_parens(self):
        m = parse_rom_filename("bios.bin")
        assert m.title == "bios"
        assert m.regions == []
        assert m.extension == ".bin"

    def test_empty_extension(self):
        m = parse_rom_filename("MyGame (USA)")
        assert m.title == "MyGame"
        assert m.extension == ""


# ── Titles with tricky characters ───────────────────────────────────────────


class TestEdgeTitles:
    def test_dots_in_title(self):
        m = parse_rom_filename("S.W.A.R.M. (USA).zip")
        assert m.title == "S.W.A.R.M."
        assert m.extension == ".zip"

    def test_title_with_number_dot(self):
        m = parse_rom_filename("No. 1 (Europe).sfc")
        assert m.title == "No. 1"

    def test_title_with_hyphen(self):
        m = parse_rom_filename("Mega Man X - Sigma (Japan).smc")
        assert m.title == "Mega Man X - Sigma"

    def test_title_with_apostrophe(self):
        m = parse_rom_filename("Kirby's Adventure (USA).nes")
        assert m.title == "Kirby's Adventure"


# ── BIOS detection ──────────────────────────────────────────────────────────


class TestBIOS:
    def test_bios_tag(self):
        m = parse_rom_filename("[BIOS] PlayStation (USA) (v5.0).bin")
        assert m.is_bios is True
        assert m.title == "PlayStation"
        assert m.revision == "v5.0"

    def test_bios_lowercase(self):
        m = parse_rom_filename("[bios] Game Boy Advance (World).bin")
        assert m.is_bios is True
        assert m.title == "Game Boy Advance"

    def test_no_bios_tag(self):
        m = parse_rom_filename("SomeBios (Japan).bin")
        assert m.is_bios is False

    def test_multiple_square_tags(self):
        m = parse_rom_filename("[BIOS] [b] Console (World).bin")
        assert m.is_bios is True
        assert m.title == "Console"


# ── Release types ───────────────────────────────────────────────────────────


class TestReleaseTypes:
    def test_beta_no_number(self):
        m = parse_rom_filename("Cool Game (USA) (Beta).gba")
        assert m.release_type == "Beta"
        assert m.release_num is None

    def test_beta_with_number(self):
        m = parse_rom_filename("Cool Game (USA) (Beta 3).gba")
        assert m.release_type == "Beta"
        assert m.release_num == 3

    def test_proto(self):
        m = parse_rom_filename("Unfinished Game (Japan) (Proto).sfc")
        assert m.release_type == "Proto"
        assert m.release_num is None

    def test_proto_with_number(self):
        m = parse_rom_filename("Unfinished Game (Japan) (Proto 2).sfc")
        assert m.release_type == "Proto"
        assert m.release_num == 2

    def test_demo(self):
        m = parse_rom_filename("Game (Europe) (Demo).nds")
        assert m.release_type == "Demo"

    def test_kiosk(self):
        m = parse_rom_filename("Game (USA) (Kiosk).gba")
        assert m.release_type == "Kiosk"

    def test_kiosk_demo(self):
        m = parse_rom_filename("Game (USA) (Kiosk Demo).gba")
        assert m.release_type == "Kiosk"

    def test_sample(self):
        m = parse_rom_filename("Game (Japan) (Sample).gba")
        assert m.release_type == "Sample"

    def test_unlicensed(self):
        m = parse_rom_filename("Pirate Game (USA) (Unl).nes")
        assert m.release_type == "Unlicensed"

    def test_no_release_type(self):
        m = parse_rom_filename("Normal Game (USA).nes")
        assert m.release_type is None
        assert m.release_num is None


# ── Revisions ───────────────────────────────────────────────────────────────


class TestRevisions:
    def test_rev_number(self):
        m = parse_rom_filename("Game (USA) (Rev 1).nes")
        assert m.revision == "Rev 1"

    def test_rev_letter(self):
        m = parse_rom_filename("Game (USA) (Rev A).nes")
        assert m.revision == "Rev A"

    def test_version_number(self):
        m = parse_rom_filename("Game (Europe) (v1.1).sfc")
        assert m.revision == "v1.1"

    def test_no_revision(self):
        m = parse_rom_filename("Game (USA).nes")
        assert m.revision is None


# ── Dates ───────────────────────────────────────────────────────────────────


class TestDates:
    def test_date_present(self):
        m = parse_rom_filename("Prototype (USA) (1997-03-15).n64")
        assert m.date == "1997-03-15"

    def test_no_date(self):
        m = parse_rom_filename("Game (USA).nes")
        assert m.date is None


# ── Languages ───────────────────────────────────────────────────────────────


class TestLanguages:
    def test_single_language(self):
        m = parse_rom_filename("Game (Europe) (En).sfc")
        assert m.languages == ["En"]

    def test_multi_language(self):
        m = parse_rom_filename("Game (Europe) (En,Fr,De).sfc")
        assert set(m.languages) == {"En", "Fr", "De"}

    def test_language_with_spaces(self):
        m = parse_rom_filename("Game (Europe) (En, Fr).sfc")
        assert set(m.languages) == {"En", "Fr"}

    def test_unknown_language_code_falls_to_feature(self):
        m = parse_rom_filename("Game (USA) (Zz).nes")
        assert m.languages == []
        assert "Zz" in m.features


# ── Features ────────────────────────────────────────────────────────────────


class TestFeatures:
    def test_unknown_tag_is_feature(self):
        m = parse_rom_filename("Game (USA) (SGB Enhanced).gbc")
        assert "SGB Enhanced" in m.features

    def test_multiple_features(self):
        m = parse_rom_filename("Game (USA) (Rumble Version) (SGB Enhanced).gbc")
        assert "Rumble Version" in m.features
        assert "SGB Enhanced" in m.features


# ── Combined / complex filenames ────────────────────────────────────────────


class TestComplex:
    def test_full_tags(self):
        m = parse_rom_filename(
            "[BIOS] PlayStation (USA) (v5.0) (1997-01-06).bin"
        )
        assert m.is_bios is True
        assert m.title == "PlayStation"
        assert m.regions == ["USA"]
        assert m.revision == "v5.0"
        assert m.date == "1997-01-06"
        assert m.extension == ".bin"

    def test_beta_with_region_and_language(self):
        m = parse_rom_filename("Cool Game (Europe) (Beta 2) (En,Fr).gba")
        assert m.title == "Cool Game"
        assert m.regions == ["Europe"]
        assert m.release_type == "Beta"
        assert m.release_num == 2
        assert set(m.languages) == {"En", "Fr"}

    def test_zip_extension(self):
        m = parse_rom_filename("Game (USA).zip")
        assert m.extension == ".zip"

    def test_7z_extension(self):
        m = parse_rom_filename("Game (Japan).7z")
        assert m.extension == ".7z"

    def test_empty_paren_group_ignored(self):
        m = parse_rom_filename("Game (USA) ().nes")
        assert m.regions == ["USA"]
        assert m.features == []

    def test_returns_rommeta_instance(self):
        m = parse_rom_filename("Test (USA).nes")
        assert isinstance(m, RomMeta)
