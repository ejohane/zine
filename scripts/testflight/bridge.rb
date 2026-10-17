# JSON stdin/stdout boundary. Never emit upstream errors or authentication material.
File.umask(0o077)
require 'json'
require 'bundler/setup'
require 'fastlane'
require 'spaceship'
require 'xcodeproj'
require 'net/http'

module ZineTestFlight
  APP = '6823593368'
  GROUP = '83615578-9adf-46d6-9ffd-a6b30d319160'
  def self.api(method, path, body = nil)
    uri = URI.join('https://api.appstoreconnect.apple.com', path)
    raise 'Unexpected API origin' unless uri.scheme == 'https' && uri.host == 'api.appstoreconnect.apple.com'
    token = Spaceship::ConnectAPI::Token.create(
      key_id: ENV.fetch('ZINE_ASC_KEY_ID'), issuer_id: ENV['ZINE_ASC_ISSUER_ID'],
      filepath: ENV.fetch('ZINE_ASC_KEY_FILE'), in_house: false
    )
    request = (method == :post ? Net::HTTP::Post : Net::HTTP::Get).new(uri)
    request['Authorization'] = "Bearer #{token.text}"
    request['Content-Type'] = 'application/json'
    request.body = JSON.generate(body) if body
    response = Net::HTTP.start(uri.host, uri.port, use_ssl: true, open_timeout: 20, read_timeout: 60) { |http| http.request(request) }
    raise "ASC HTTP #{response.code}" unless response.is_a?(Net::HTTPSuccess)
    response.body.to_s.empty? ? {} : JSON.parse(response.body)
  end
  def self.run(input)
    case input.fetch('action')
    when 'project'
      project = Xcodeproj::Project.open(input.fetch('project'))
      targets = project.targets.reject { |t| t.product_type == 'com.apple.product-type.bundle.unit-test' }
      targets.map do |target|
        config = target.build_configurations.find { |c| c.name == 'Release' }
        settings = config.build_settings
        if input['prepare']
          settings['CODE_SIGN_STYLE'] = 'Manual'
          settings['CODE_SIGN_IDENTITY'] = input.fetch('certificate')
          settings['PROVISIONING_PROFILE_SPECIFIER'] = input.fetch('profiles').fetch(target.name)
          settings['CURRENT_PROJECT_VERSION'] = input.fetch('build')
          project.save
        end
        {name: target.name, type: target.product_type, settings: settings}
      end
    when 'get'
      path = input.fetch('path')
      # Reads are restricted to this app's release resources by Python guards.
      api(:get, path)
    when 'assign'
      id = input.fetch('build_id')
      raise 'Invalid build ID' unless id.match?(/\A[a-zA-Z0-9-]+\z/)
      api(:post, "/v1/betaGroups/#{GROUP}/relationships/builds", {data: [{type: 'builds', id: id}]})
    when 'upload'
      require 'pilot'
      # Only the bytes are uploaded; metadata, compliance and distribution remain explicit.
      key = {key_id: ENV.fetch('ZINE_ASC_KEY_ID'), issuer_id: ENV['ZINE_ASC_ISSUER_ID'],
             key: File.binread(ENV.fetch('ZINE_ASC_KEY_FILE')), in_house: false}
      Spaceship::ConnectAPI.token = Spaceship::ConnectAPI::Token.create(**key)
      options = FastlaneCore::Configuration.create(Pilot::Options.available_options,
        api_key: key,
        ipa: input.fetch('ipa'), apple_id: APP, app_identifier: 'app.zine.native',
        skip_submission: true, skip_waiting_for_build_processing: true,
        distribute_external: false, notify_external_testers: false)
      Pilot::BuildManager.new.upload(options)
      {uploaded: true}
    else
      raise 'Unknown action'
    end
  end
end
if $PROGRAM_NAME == __FILE__
  begin
    input = JSON.parse(STDIN.read)
    # fastlane may log keys, paths or server bodies. Discard its entire output.
    result = nil
    original = STDOUT.dup
    STDOUT.reopen(File::NULL, 'w')
    STDERR.reopen(File::NULL, 'w')
    result = ZineTestFlight.run(input)
    original.puts(JSON.generate(result))
  rescue StandardError
    exit 1
  end
end
