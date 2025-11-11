

const createNode = async (req, res, type) => {
  try {
    const { label, parentId, meta } = req.body;

    const node = await DMS.create({
      label,
      type,
      parentId: parentId || null,
      meta,
    });

    res.status(201).json(node);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};


module.exports = createNode;