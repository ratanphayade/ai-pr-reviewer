import {
  getBooleanInput,
  getInput,
  getMultilineInput,
  setFailed,
  warning
} from '@actions/core'
import {Bot} from './bot'
import { onDemandCodeReview } from './ondemand-review'
import {OpenAIOptions, Options} from './options'
import {Prompts} from './prompts'
import {codeReview} from './review'
// import {handleReviewComment} from './review-comment'

const defaultSystemMessage = 'You are `@razorgenius` (aka `github-actions[bot]`), a language model\n' +
    '            trained by OpenAI. Your purpose is to act as a highly experienced\n' +
    '            software engineer and provide a thorough review of the code hunks\n' +
    '            and suggest code snippets to improve key areas such as:\n' +
    '              - Logic\n' +
    '              - Security\n' +
    '              - Performance\n' +
    '              - Data races\n' +
    '              - Consistency\n' +
    '              - Error handling\n' +
    '              - Maintainability\n' +
    '              - Modularity\n' +
    '              - Complexity\n' +
    '              - Optimization\n' +
    '              - Best practices: DRY, SOLID, KISS\n\n' +
    '            Do not comment on minor code style issues, missing\n' +
    '            comments/documentation, good code changes. Identify and resolve significant\n' +
    '            concerns to improve overall code quality while deliberately\n' +
    '            disregarding minor issues.'

const defaultBaseURL = 'https://devproductivity-codereview.openai.azure.com/openai/deployments/CodeReviewerGPT4';
const defaultModel = 'gpt_latest'
const defaultDebugValue = true;

function getInputWithDefault(val: string, defaultVal: string) {
  if (val == '') {
    return defaultVal
  }
  return val
}

async function run(): Promise<void> {
  const options: Options = new Options(
    getBooleanInput('debug'),
    getBooleanInput('disable_review'),
    getBooleanInput('disable_release_notes'),
    getInput('max_files'),
    getBooleanInput('review_simple_changes'),
    getBooleanInput('review_comment_lgtm'),
    getMultilineInput('path_filters'),
    getInputWithDefault(getInput('system_message'), defaultSystemMessage),
    getInputWithDefault(getInput('openai_light_model'), defaultModel),
    getInputWithDefault(getInput('openai_heavy_model'), defaultModel),
    getInput('openai_model_temperature'),
    getInput('openai_retries'),
    getInput('openai_timeout_ms'),
    getInput('openai_concurrency_limit'),
    getInput('github_concurrency_limit'),
    getInputWithDefault(getInput('openai_base_url'), defaultBaseURL),
    getInput('language')
  )

  // print options
  options.print()

  const prompts: Prompts = new Prompts(
    getInput('summarize'),
    getInput('summarize_release_notes')
  )

  // Create two bots, one for summary and one for review

  let lightBot: Bot | null = null
  try {
    lightBot = new Bot(
      options,
      new OpenAIOptions(options.openaiLightModel, options.lightTokenLimits)
    )
  } catch (e: any) {
    warning(
      `Skipped: failed to create summary bot, please check your openai_api_key: ${e}, backtrace: ${e.stack}`
    )
    return
  }

  let heavyBot: Bot | null = null
  try {
    heavyBot = new Bot(
      options,
      new OpenAIOptions(options.openaiHeavyModel, options.heavyTokenLimits)
    )
  } catch (e: any) {
    warning(
      `Skipped: failed to create review bot, please check your openai_api_key: ${e}, backtrace: ${e.stack}`
    )
    return
  }

  try {
    console.log("event_received");
    console.log(process.env.GITHUB_EVENT_NAME);
    // check if the event is pull_request
    if (
      process.env.GITHUB_EVENT_NAME === 'pull_request' ||
      process.env.GITHUB_EVENT_NAME === 'pull_request_target'
    ) {
      await codeReview(lightBot, heavyBot, options, prompts)
    } 
    else if (process.env.GITHUB_EVENT_NAME === 'issue_comment') {
      await onDemandCodeReview(lightBot, heavyBot, options, prompts)
    }
    else {
      warning('Skipped: this action only works on push events or pull_request')
    }
  } catch (e: any) {
    if (e instanceof Error) {
      setFailed(`Failed to run: ${e.message}, backtrace: ${e.stack}`)
    } else {
      setFailed(`Failed to run: ${e}, backtrace: ${e.stack}`)
    }
  }
}

process
  .on('unhandledRejection', (reason, p) => {
    warning(`Unhandled Rejection at Promise: ${reason}, promise is ${p}`)
  })
  .on('uncaughtException', (e: any) => {
    warning(`Uncaught Exception thrown: ${e}, backtrace: ${e.stack}`)
  })

await run()
