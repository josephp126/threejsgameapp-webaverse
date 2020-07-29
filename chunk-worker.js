importScripts('./bin/objectize2.js');

const potentialDefault = -0.5;
const maxNumObjects = 10;

class Allocator {
  constructor() {
    this.offsets = [];
  }
  alloc(constructor, size) {
    const offset = self.Module._malloc(size * constructor.BYTES_PER_ELEMENT);
    const b = new constructor(self.Module.HEAP8.buffer, self.Module.HEAP8.byteOffset + offset, size);
    b.offset = offset;
    this.offsets.push(offset);
    return b;
  }
  freeAll() {
    for (let i = 0; i < this.offsets.length; i++) {
      self.Module._doFree(this.offsets[i]);
    }
    this.offsets.length = 0;
  }
}

const _makeSlabData = (x, y, z, parcelSize, subparcelSize) => {
  const allocator = new Allocator();

  const potentials = allocator.alloc(Float32Array, subparcelSize * subparcelSize * subparcelSize);
  const objectPositions = allocator.alloc(Float32Array, maxNumObjects*3);
  const objectQuaternions = allocator.alloc(Float32Array, maxNumObjects*3);
  const objectTypes = allocator.alloc(Uint32Array, maxNumObjects);
  const numObjects = allocator.alloc(Uint32Array, 1);

  return {
    potentials,
    objectPositions,
    objectQuaternions,
    objectTypes,
    numObjects,
    allocator,
  }
};

class Chunk {
  constructor(meshId, parcelSize, subparcelSize) {
    this.meshId = meshId;
    this.parcelSize = parcelSize;
    this.subparcelSize = subparcelSize;

    this.index = 0;
    this.slabs = [];
  }
  getSlab(x, y, z) {
    return this.slabs.find(slab => slab.x === x && slab.y === y && slab.z === z);
  }
  getOrCreateSlab(x, y, z) {
    let slab = this.getSlab(x, y, z);
    if (!slab) {
      const data = _makeSlabData(x, y, z, this.parcelSize, this.subparcelSize);
      slab = this.setSlab(x, y, z, data);
    }
    return slab;
  }
  setSlab(x, y, z, data) {
    const slab = {
      x,
      y,
      z,
      slabIndex: this.index,
      data,
    };
    this.slabs.push(slab);
    this.index++;
    return slab;
  }
}
const chunks = [];
const _getChunk = (meshId, parcelSize, subparcelSize) => {
  let chunk = chunks.find(chunk => chunk.meshId === meshId);
  if (!chunk) {
    chunk = new Chunk(meshId, parcelSize, subparcelSize);
    chunks.push(chunk);
  }
  return chunk;
}

function mod(a, b) {
  return ((a%b)+b)%b;
}
const _getPotentialIndex = (x, y, z, subparcelSize) => x + y*subparcelSize*subparcelSize + z*subparcelSize;
const _getPotentialFullIndex = (x, y, z, subparcelSizeP1) => x + y*subparcelSizeP1*subparcelSizeP1 + z*subparcelSizeP1;
const _loadNoise = (seedData, x, y, z, baseHeight, freqsData, octavesData, scalesData, uvsData, ampsData, parcelSize, subparcelSize, data) => {
  const {
    potentials,
    objectPositions,
    objectQuaternions,
    objectTypes,
    numObjects,
  } = data;

  freqs.set(Float32Array.from(freqsData));
  octaves.set(Int32Array.from(octavesData));
  scales.set(Float32Array.from(scalesData));
  uvs.set(Float32Array.from(uvsData));
  amps.set(Float32Array.from(ampsData));
  dims.set(Int32Array.from([subparcelSize, subparcelSize, subparcelSize]));
  limits.set(Int32Array.from([parcelSize, parcelSize, parcelSize]));
  shifts.set(Float32Array.from([x*subparcelSize, y*subparcelSize, z*subparcelSize]));

  const wormRate = 2;
  const wormRadiusBase = 2;
  const wormRadiusRate = 2;
  const objectsRate = 3;

  Module._doNoise3(
    seedData,
    baseHeight,
    freqs.offset,
    octaves.offset,
    scales.offset,
    uvs.offset,
    amps.offset,
    dims.offset,
    shifts.offset,
    limits.offset,
    wormRate,
    wormRadiusBase,
    wormRadiusRate,
    objectsRate,
    potentialDefault,
    potentials.offset,
    objectPositions.offset,
    objectQuaternions.offset,
    objectTypes.offset,
    numObjects.offset
  );
};
/* const _makePlanetPotentials = (seedData, shiftsData) => {
  const allocator = new Allocator();

  const potentials = allocator.alloc(Float32Array, SUBPARCEL_SIZE * SUBPARCEL_SIZE * SUBPARCEL_SIZE);
  const dims = allocator.alloc(Int32Array, 3);
  dims.set(Int32Array.from([SUBPARCEL_SIZE, SUBPARCEL_SIZE, SUBPARCEL_SIZE]));
  const shifts = allocator.alloc(Float32Array, 3);
  shifts.set(Float32Array.from(shiftsData));

  Module._doNoise2(
    seedData,
    0.02,
    4,
    dims.offset,
    shifts.offset,
    potentialDefault,
    potentials.offset
  );

  return {potentials, dims, shifts};
}; */
const _getChunkSpec = (potentials, shiftsData, meshId, subparcelSize) => {
  const subparcelSizeP1 = subparcelSize+1;

  const allocator = new Allocator();

  const dims = allocator.alloc(Int32Array, 3);
  dims.set(Int32Array.from([subparcelSizeP1, subparcelSizeP1, subparcelSizeP1]));
  const shifts = allocator.alloc(Float32Array, 3);
  shifts.set(Float32Array.from(shiftsData));
  const positions = allocator.alloc(Float32Array, 4 * 1024 * 1024);
  const barycentrics = allocator.alloc(Float32Array, 4 * 1024 * 1024);

  const numPositions = allocator.alloc(Uint32Array, 1);
  numPositions[0] = positions.length;
  const numBarycentrics = allocator.alloc(Uint32Array, 1);
  numBarycentrics[0] = barycentrics.length;

  const scale = allocator.alloc(Float32Array, 3);
  scale.set(Float32Array.from([1, 1, 1]));

  self.Module._doMarchingCubes2(
    dims.offset,
    potentials.offset,
    shifts.offset,
    scale.offset,
    positions.offset,
    barycentrics.offset,
    numPositions.offset,
    numBarycentrics.offset
  );

  const arrayBuffer2 = new ArrayBuffer(
    numPositions[0] * Float32Array.BYTES_PER_ELEMENT +
    numBarycentrics[0] * Float32Array.BYTES_PER_ELEMENT +
    numPositions[0]/3 * Float32Array.BYTES_PER_ELEMENT +
    numPositions[0]/3 * Float32Array.BYTES_PER_ELEMENT
  );

  let index = 0;

  // const outPotentials = new Float32Array(arrayBuffer2, index, potentials.length);
  // outPotentials.set(potentials);
  // index += Float32Array.BYTES_PER_ELEMENT * potentials.length;

  const outP = new Float32Array(arrayBuffer2, index, numPositions[0]);
  outP.set(new Float32Array(positions.buffer, positions.byteOffset, numPositions[0]));
  index += Float32Array.BYTES_PER_ELEMENT * numPositions[0];

  const outB = new Float32Array(arrayBuffer2, index, numBarycentrics[0]);
  outB.set(new Float32Array(barycentrics.buffer, barycentrics.byteOffset, numBarycentrics[0]));
  index += Float32Array.BYTES_PER_ELEMENT * numBarycentrics[0];

  /* const outI = new Uint32Array(arrayBuffer2, index, numIndices[0]);
  outI.set(new Uint32Array(indices.buffer, indices.byteOffset, numIndices[0]));
  index += Uint32Array.BYTES_PER_ELEMENT * numIndices[0]; */

  allocator.freeAll();

  const ids = new Float32Array(arrayBuffer2, index, numPositions[0]/3);
  index += numPositions[0]/3 * Float32Array.BYTES_PER_ELEMENT;
  const indices = new Float32Array(arrayBuffer2, index, numPositions[0]/3);
  index += numPositions[0]/3 * Float32Array.BYTES_PER_ELEMENT;
  for (let i = 0; i < numPositions[0]/3/3; i++) {
    ids[i*3] = meshId;
    ids[i*3+1] = meshId;
    ids[i*3+2] = meshId;
    indices[i*3] = i;
    indices[i*3+1] = i;
    indices[i*3+2] = i;
  }

  return {
    // result: {
    // potentials: outPotentials,
    positions: outP,
    barycentrics: outB,
    ids,
    indices,
    arrayBuffer: arrayBuffer2,
    // indices: outI,
  };
};
const _meshChunkSlab = (chunk, slab, subparcelSize) => {
  const subparcelSizeP1 = subparcelSize+1;

  const allocator = new Allocator();
  const fullPotentials = allocator.alloc(Float32Array, subparcelSizeP1 * subparcelSizeP1 * subparcelSizeP1);
  for (let dx = 0; dx < subparcelSizeP1; dx++) {
    const lix = slab.x + Math.floor(dx/subparcelSize);
    for (let dy = 0; dy < subparcelSizeP1; dy++) {
      const liy = slab.y + Math.floor(dy/subparcelSize);
      for (let dz = 0; dz < subparcelSizeP1; dz++) {
        const liz = slab.z + Math.floor(dz/subparcelSize);
        const fullIndex = _getPotentialFullIndex(dx, dy, dz, subparcelSizeP1);
        const localSlab = chunk.getSlab(lix, liy, liz);
        if (localSlab) {
          const lx = mod(dx, subparcelSize);
          const ly = mod(dy, subparcelSize)
          const lz = mod(dz, subparcelSize)
          const index = _getPotentialIndex(lx, ly, lz, subparcelSize);
          fullPotentials[fullIndex] = localSlab.data.potentials[index];
        } else {
          fullPotentials[fullIndex] = potentialDefault;
        }
      }
    }
  }
  const shiftsData = [
    slab.x*subparcelSize,
    slab.y*subparcelSize,
    slab.z*subparcelSize,
  ];
  const {positions, barycentrics, ids, indices, arrayBuffer: arrayBuffer2} = _getChunkSpec(fullPotentials, shiftsData, chunk.meshId, subparcelSize);
  allocator.freeAll();
  return [
    {
      positions,
      barycentrics,
      ids,
      indices,
      x: slab.x,
      y: slab.y,
      z: slab.z,
      // arrayBuffer2,
    },
    arrayBuffer2
  ];
};

const queue = [];
let loaded = false;
const _handleMessage = data => {
  const {method} = data;
  switch (method) {
    case 'loadPotentials': {
      const {seed: seedData, meshId, x, y, z, baseHeight, freqs, octaves, scales, uvs, amps, potentials, parcelSize, subparcelSize} = data;

      const chunk = _getChunk(meshId, parcelSize, subparcelSize);
      const slab = chunk.getOrCreateSlab(x, y, z);

      _loadNoise(seedData, x, y, z, baseHeight, freqs, octaves, scales, uvs, amps, parcelSize, subparcelSize, slab.data);
      if (potentials) {
        for (let i = 0; i < potentials.length; i++) {
          slab.data.potentials[i] += potentials[i];
        }
      }

      self.postMessage({
        result: {},
      });
      /* const {
        objectPositions,
        objectQuaternions,
        objectTypes,
        numObjects,
      } = slab.data;
      self.postMessage({
        result: {
          objectPositions,
          objectQuaternions,
          objectTypes,
          numObjects,
        },
      }); */
      break;
    }
    case 'marchLand': {
      const {seed: seedData, meshId, x, y, z, parcelSize, subparcelSize} = data;

      const results = [];
      const transfers = [];
      const chunk = _getChunk(meshId);
      const slab = chunk.getSlab(x, y, z);
      const [result, transfer] = _meshChunkSlab(chunk, slab, subparcelSize);
      results.push(result);
      transfers.push(transfer);

      self.postMessage({
        result: results,
      }, transfers);
      break;
    }
    case 'mine': {
      const {meshId, mineSpecs, subparcelSize} = data;

      const chunk = _getChunk(meshId);

      for (const mineSpec of mineSpecs) {
        const slab = chunk.getSlab(mineSpec.x, mineSpec.y, mineSpec.z);
        if (!slab) {
          console.warn('mining unknown subparcel!', mineSpec.x, mineSpec.y, mineSpec.z);
          debugger;
        }
        for (const mine of mineSpec.mines) {
          const [potentialIndex, value] = mine;
          slab.data.potentials[potentialIndex] += value;
        }
      }

      const results = [];
      const transfers = [];
      for (const mineSpec of mineSpecs) {
        const slab = chunk.getSlab(mineSpec.x, mineSpec.y, mineSpec.z);
        const [result, transfer] = _meshChunkSlab(chunk, slab, subparcelSize);
        results.push(result);
        transfers.push(transfer);
      }

      self.postMessage({
        result: results,
      }, transfers);
      break;
    }
    default: {
      console.warn('unknown method', data.method);
      break;
    }
  }
};
const _flushMessages = () => {
  for (let i = 0; i < queue.length; i++) {
    _handleMessage(queue[i]);
  }
};
self.onmessage = e => {
  const {data} = e;
  if (!loaded) {
    queue.push(data);
  } else {
    _handleMessage(data);
  }
};

let freqs, octaves, scales, uvs, amps, dims, limits, shifts;
wasmModulePromise.then(() => {
  loaded = true;

  const allocator = new Allocator();
  freqs = allocator.alloc(Float32Array, 3);
  octaves = allocator.alloc(Int32Array, 3);
  scales = allocator.alloc(Float32Array, 3);
  uvs = allocator.alloc(Float32Array, 3);
  amps = allocator.alloc(Float32Array, 3);
  dims = allocator.alloc(Int32Array, 3);
  limits = allocator.alloc(Int32Array, 3);
  shifts = allocator.alloc(Float32Array, 3);

  _flushMessages();
}).catch(err => {
  console.warn(err.stack);
});
