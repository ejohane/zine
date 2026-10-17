# Run the real pinned Pilot upload path with a fake Transporter; network is forbidden.
require_relative '../../scripts/testflight/bridge'
require 'pilot'
require 'tmpdir'
require 'fileutils'

def assert(condition, message)
  raise message unless condition
end

module Net
  class HTTP
    def self.start(*)
      raise 'Unexpected network access in test'
    end
  end
end

class FakeTransporter
  attr_reader :calls
  def initialize
    @calls = 0
  end
  def upload(**args)
    @calls += 1
    true
  end
end

class Pilot::BuildManager
  alias original_transporter_for_selected_team transporter_for_selected_team
  def transporter_for_selected_team(options)
    $captured_options = options
    $fake_transporter
  end
  def distribute(*)
    raise 'Unexpected distribution by Pilot'
  end
end

module FastlaneCore
  class IpaFileAnalyser
    def self.fetch_app_platform(*)
      'ios'
    end
    def self.fetch_app_version(*)
      '0.1'
    end
    def self.fetch_app_build(*)
      '2026101702'
    end
  end
  class IpaUploadPackageBuilder
    def generate(**args)
      assert(args[:app_id] == '6823593368', 'Wrong upload app')
      assert(args[:app_identifier] == 'app.zine.native', 'Wrong upload bundle')
      args[:ipa_path]
    end
  end
end

class Spaceship::ConnectAPI
  def self.login(*)
    raise 'Unexpected Apple ID login'
  end
end

class Spaceship::ConnectAPI::Token
  def self.create(**key)
    assert(key[:key] == 'fixture-key-not-a-real-credential', 'Key not loaded into memory')
    Struct.new(:in_house, :text).new(false, "fixture-token")
  end
end

Dir.mktmpdir do |directory|
  ENV['ZINE_ASC_KEY_ID'] = 'FIXTURE'
  ENV['ZINE_ASC_KEY_FILE'] = File.join(directory, 'fixture.p8')
  File.write(ENV['ZINE_ASC_KEY_FILE'], 'fixture-key-not-a-real-credential')
  ipa = File.join(directory, 'Zine.ipa')
  File.write(ipa, 'fixture-ipa')
  [nil, 'fixture-issuer'].each do |issuer|
    issuer ? ENV['ZINE_ASC_ISSUER_ID'] = issuer : ENV.delete('ZINE_ASC_ISSUER_ID')
    $fake_transporter = FakeTransporter.new
    result = ZineTestFlight.run({'action' => 'upload', 'ipa' => ipa})
    assert(result[:uploaded], 'Missing upload result')
    assert($fake_transporter.calls == 1, 'Expected exactly one transport upload')
    assert($captured_options[:api_key][:issuer_id] == issuer, 'Issuer changed')
    assert($captured_options[:skip_submission] && $captured_options[:skip_waiting_for_build_processing], 'Unsafe Pilot options')
    assert(!$captured_options[:distribute_external] && !$captured_options[:notify_external_testers], 'External distribution enabled')
  end
  # Verify per-target manual signing/build edits against a copy of the real project.
  source = File.expand_path('../../apps/ios/ZineNative.xcodeproj', __dir__)
  project = File.join(directory, 'ZineNative.xcodeproj')
  FileUtils.cp_r(source, project)
  profiles = {'ZineNative' => 'app-profile', 'ZineShareExtension' => 'share-profile'}
  ZineTestFlight.run({'action' => 'project', 'project' => project, 'prepare' => true,
                      'certificate' => 'fixture-certificate', 'profiles' => profiles,
                      'build' => '2026101702'})
  targets = ZineTestFlight.run({'action' => 'project', 'project' => project})
  assert(targets.size == 2, 'Unexpected targets')
  targets.each do |target|
    settings = target[:settings]
    assert(settings['CURRENT_PROJECT_VERSION'] == '2026101702', 'Build mismatch')
    assert(settings['CODE_SIGN_STYLE'] == 'Manual', 'Automatic signing enabled')
    assert(settings['PROVISIONING_PROFILE_SPECIFIER'] == profiles[target[:name]], 'Wrong target profile')
    assert(settings['DEVELOPMENT_TEAM'] == 'TRA7965NM5', 'Team changed')
  end
end
puts 'PASS: pinned Pilot uploads once for individual/team keys, never uses Apple ID login or distributes; project signing synchronized'
