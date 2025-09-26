const { Appearance, BlendingState, BoundingSphere, Cartesian3, Geometry, GeometryInstance, GeometryAttribute, GeometryAttributes, Material, Matrix4, Primitive, PrimitiveType } = Cesium;

const UPDATE_COUNT_OF_PARTICLE_COUNT = 1;
const POSITION_ATTRIBUTE_COUNT = 3;
const MOUSE_ATTRIBUTE_COUNT = 4;
const scratchStep = new Cartesian3();
const scratchSubPosition = new Cartesian3();

class Trail {
    constructor(scene) {
        this._scene = scene;

        this._totalParticleCount = UPDATE_COUNT_OF_PARTICLE_COUNT * 5;

        const count = this._totalParticleCount;

        this._positions = new Float64Array(count * POSITION_ATTRIBUTE_COUNT);
        this._mouse = new Float32Array(count * MOUSE_ATTRIBUTE_COUNT);
        this._afront = new Float32Array(count * 2);
        this._random = new Float32Array(count);

        const positions = this._positions;
        const mouse = this._mouse;
        const aFront = this._afront;

        this._positionIndex = 0;
        this._mouseIndex = 0;

        for (let i = 0; i < count; i++) {
            positions[i * 3 + 0] = 0;
            positions[i * 3 + 1] = 0;
            positions[i * 3 + 2] = 0;

            mouse[i * 4 + 0] = -1;
            mouse[i * 4 + 1] = Math.random();
            mouse[i * 4 + 2] = Math.random();
            mouse[i * 4 + 3] = Math.random();

            aFront[i * 2 + 0] = 0;
            aFront[i * 2 + 1] = 0;

            this._random[i] = Math.random();
        }

        this._primitive = undefined;
        this._timestamp = 0; // JulianDate.secondsOfDay
        this._oldPosition = null;
        this._modelMatrix = new Matrix4();
        this._inverseModelMatrix = new Matrix4();

        this._update = false;

        this._boundingSphere = new BoundingSphere();
    }

    get boundingVolume() {
        return this._boundingSphere;
    }

    isDestroyed() {
        return false;
    }

    _createGeometry(modelMatrix) {
        Matrix4.clone(modelMatrix, this._modelMatrix);

        Matrix4.inverse(modelMatrix, this._inverseModelMatrix);

        const position = Matrix4.getTranslation(modelMatrix, new Cartesian3());

        const diff = new Cartesian3();

        if (this._oldPosition) {
            Cartesian3.subtract(position, this._oldPosition, diff);
        }

        const totalParticleCount = this._totalParticleCount;

        for (let i = 0; i < UPDATE_COUNT_OF_PARTICLE_COUNT; i++) {
            const ci = (this._positionIndex % (totalParticleCount * POSITION_ATTRIBUTE_COUNT)) + i * POSITION_ATTRIBUTE_COUNT;

            let subPosition = position;

            if (this._oldPosition) {
                const step = Cartesian3.multiplyByScalar(diff, i / UPDATE_COUNT_OF_PARTICLE_COUNT, scratchStep);

                subPosition = Cartesian3.add(this._oldPosition, step, scratchSubPosition);
            }

            this._positions[ci + 0] = position.x;
            this._positions[ci + 1] = position.y;
            this._positions[ci + 2] = position.z;
        }

        for (let i = 0; i < UPDATE_COUNT_OF_PARTICLE_COUNT; i++) {
            const ci = (this._mouseIndex % (totalParticleCount * MOUSE_ATTRIBUTE_COUNT)) + i * MOUSE_ATTRIBUTE_COUNT;

            this._mouse[ci + 0] = this._timestamp;
        }

        this._oldPosition = position;
        this._positionIndex += POSITION_ATTRIBUTE_COUNT * UPDATE_COUNT_OF_PARTICLE_COUNT;
        this._mouseIndex += MOUSE_ATTRIBUTE_COUNT * UPDATE_COUNT_OF_PARTICLE_COUNT;

        const attributes = new GeometryAttributes({
            position: new GeometryAttribute({
                componentDatatype: Cesium.ComponentDatatype.DOUBLE,
                componentsPerAttribute: 3,
                values: this._positions
            }),
            mouse: new GeometryAttribute({
                componentDatatype: Cesium.ComponentDatatype.FLOAT,
                componentsPerAttribute: 4,
                values: this._mouse
            }),
            aFront: new GeometryAttribute({
                componentDatatype: Cesium.ComponentDatatype.FLOAT,
                componentsPerAttribute: 2,
                values: this._afront
            }),
            random: new GeometryAttribute({
                componentDatatype: Cesium.ComponentDatatype.FLOAT,
                componentsPerAttribute: 1,
                values: this._random
            })
        });

        const geometry = new Geometry({
            attributes: attributes,
            primitiveType: PrimitiveType.POINTS,
            boundingSphere: new BoundingSphere(position, 1000)
        });

        return geometry;
    }

    _createPrimitve() {
        function v_shader() {
            return `

          in vec3 position3DHigh;
          in vec3 position3DLow;
          in float batchId;

          uniform float u_test; 
          
          void main() {
              vec4 position = czm_modelViewProjectionRelativeToEye *czm_computePosition();
          
              gl_Position = position;

              //  if(u_test > 0.5)
              // no way to pass uniform into vertex shader
              gl_PointSize = 10.0;
          }`;
        }

        function f_shader() {
            return `
         
          uniform float u_test; 

          void main() {

            if(u_test > 0.5)
                out_FragColor = vec4(1.0, 1.0, 0.0, 1.0);
            else
                out_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
          }`;
        }

        const geometry = this._createGeometry(this._modelMatrix);

        const instance = new GeometryInstance({
            geometry: geometry
        });

        const appearance = new Appearance({
            translucent: true,
            closed: false,
            renderState: {
                blending: BlendingState.ADDITIVE_BLEND,
                depthTest: { enabled: false },
                depthMask: false
            },
            material: new Material({
                fabric: {
                    uniforms: {
                        u_test: 0.1
                    },
                    source: f_shader()
                }
            }),
            vertexShaderSource: v_shader()
        });

        this._primitive = new Primitive({
            geometryInstances: instance,
            appearance: appearance,
            asynchronous: false
        });
    }

    updatePosition(modelMatrix) {
        if (modelMatrix.equals(this._modelMatrix)) {
            return;
        }

        this._update = true;

        Matrix4.clone(modelMatrix, this._modelMatrix);
    }

    updateTimestamp(julianDate) {
        this._timestamp = julianDate.secondsOfDay;
    }

    update(frameState) {
        if (this._update) {
            this._update = false;

            if (this._primitive) this._primitive.destroy();

            this._createPrimitve();

            this._boundingSphere = new BoundingSphere();
        }

        if (this._primitive) {
            this._primitive.update(frameState);
        }
    }
}

export default Trail;
