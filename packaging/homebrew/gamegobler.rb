class Gamegobler < Formula
  desc "ROM library manager — manage games on microSD cards and Android devices"
  homepage "https://dskarbrevik.github.io/GameGobler"
  license "MIT"
  version "0.1.0"

  on_macos do
    url "https://github.com/dskarbrevik/GameGobler/releases/download/v0.1.0/GameGobler-macos"
    sha256 "PLACEHOLDER_MACOS_SHA256"
  end

  on_linux do
    url "https://github.com/dskarbrevik/GameGobler/releases/download/v0.1.0/GameGobler-linux"
    sha256 "PLACEHOLDER_LINUX_SHA256"
  end

  def install
    if OS.mac?
      bin.install "GameGobler-macos" => "gamegobler"
    elsif OS.linux?
      bin.install "GameGobler-linux" => "gamegobler"
    end
  end

  def caveats
    <<~EOS
      GameGobler starts a local web server on http://127.0.0.1:8000.
      Open that URL in your browser after running:
        gamegobler
    EOS
  end

  test do
    assert_predicate bin/"gamegobler", :executable?
  end
end
