function getComments(node, code) {
  const comments = [];
  if (node.leadingComments) {
    node.leadingComments.forEach(comment => {
      comments.push({
        type: comment.type,
        value: comment.value,
        start: comment.start,
        end: comment.end
      });
    });
  }
  return comments;
}

module.exports = {
  getComments
};