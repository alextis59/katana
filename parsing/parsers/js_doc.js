

const self = {

    extractTargetJsDoc: (code, target_start_line) => {
        let js_doc = "",
            js_doc_lines_indexes;
        try{
            let lines = code.split('\n'),
                js_doc_lines = [],
                js_doc_start_line = target_start_line;
            for(let i = target_start_line - 1; i >= 0; i--){
                let line = lines[i];
                if(line.trim().indexOf('//') === 0 || line.trim().indexOf('*') === 0
                    || line.trim().indexOf('/*') === 0 || line.trim().indexOf('*/') === 0){
                    js_doc_lines.unshift(line);
                    js_doc_start_line = i;
                }else{
                    break;
                }
            }
            if(js_doc_lines.length > 0){
                js_doc = js_doc_lines.join('\n');
                js_doc_lines_indexes = {
                    start: js_doc_start_line,
                    end: target_start_line - 1
                }
            }
        }catch(err){
            console.log('Error while extracting js doc for target');
            console.log(err);
        }
        return {js_doc, js_doc_lines_indexes};
    }

}

module.exports = self;