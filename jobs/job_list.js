const GetChatCompletion = require('./ai/get_chat_completion'),

    ExtractModuleTarget = require('./code/extraction/extract_module_target'),

    GetUnitTestTemplate = require('./code/unit_test/builders/get_unit_test_template'),

    RunUnitTest = require('./code/unit_test/execution/run_unit_test'),
    UnitTestSuccess = require('./code/unit_test/execution/unit_test_success'),
    TestTemplateDryRun = require('./code/unit_test/execution/test_template_dry_run'),

    GenerateCode = require('./code/generation/generate_code'),

    GenerateTargetJsDoc = require('./code/js_doc/generate_target_js_doc/generate_target_js_doc'),

    GenerateUnitTestCases = require('./code/unit_test/generation/generate_unit_test_cases/generate_unit_test_cases'),
    WriteUnitTestCode = require('./code/unit_test/generation/write_unit_test_code/write_unit_test_code'),
    FixUnitTestCode = require('./code/unit_test/generation/fix_unit_test_code/fix_unit_test_code'),
    // UnitTestCoverageAnnotation = require('./code/unit_test/generation/unit_test_coverage_annotation/unit_test_coverage_annotation'),
    SelectBestTestCode = require('./code/unit_test/evaluation/select_best_test_code'),

    ImplementUnitTest = require('./code/unit_test/strategies/implement_unit_test'),
    ImplementUnitTestSuite = require('./code/unit_test/strategies/implement_unit_test_suite'),

    IsValidCode = require('./utils/is_valid_code'),
    IsValidJsDoc = require('./utils/is_valid_js_doc');

module.exports = [

    new GetChatCompletion(),

    new ExtractModuleTarget(),

    new GetUnitTestTemplate(),

    new RunUnitTest(),
    new UnitTestSuccess(),
    new TestTemplateDryRun(),

    new GenerateCode(),

    new GenerateTargetJsDoc(),

    new GenerateUnitTestCases(),
    new WriteUnitTestCode(),
    new FixUnitTestCode(),
    // new UnitTestCoverageAnnotation(),
    new SelectBestTestCode(),

    new ImplementUnitTest(),
    new ImplementUnitTestSuite(),

    new IsValidCode(),
    new IsValidJsDoc()

]